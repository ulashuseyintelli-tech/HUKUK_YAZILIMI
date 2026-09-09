/*
 * OFFICE YAZMA KABUL — A-03: AYAR YUZEYI PUT YAZMA KABULU (S-01..S-08)
 *
 * A-02 §4 olcutu:
 *   Yetkili 2xx · YALNIZ HEDEF ALAN DEGISTI (oncesi/sonrasi alan-alan karsilastirma) ·
 *   yanitta S2 alani ve ACIK secret YOK · yetkisiz 403 OFFICE_F01_AUTHORIZATION_REQUIRED ·
 *   anonim 401 · izlenen diger tenant'larda FARK 0.
 *
 * "Yalniz hedef alan degisti" ALAN-ALAN olculur: PUT oncesi Office satirinin TAM kopyasi
 * alinir, PUT sonrasi tekrar okunur ve BEKLENEN alanlar disindaki HER alan icin esitlik
 * aranir (`updatedAt` haric — o her yazmada degisir ve beklenen yan etkidir).
 *
 * FAIL-CLOSED: olcum yapilamazsa (okuma hatasi) sonuc OLCULEMEDI + nonzero; "fark yok" SAYILMAZ.
 */
'use strict';
const L = require('./ow-lib');

// S-01..S-08: sekiz ayar yuzeyi. Her biri icin: yol, PUT govdesi, DEGISMESI BEKLENEN alanlar.
const SURFACES = (runId) => ([
  { id: 'S-01', path: '/office', body: { city: `Kabul-${runId}` }, expect: ['city'] },
  { id: 'S-03', path: '/office/smtp-settings', body: { smtpHost: `smtp-${runId}.invalid`, smtpPort: 2525 }, expect: ['smtpHost', 'smtpPort'] },
  { id: 'S-04', path: '/office/sms-settings', body: { smsSender: `OW${runId.slice(0, 4)}` }, expect: ['smsSender'] },
  { id: 'S-05', path: '/office/greeting-settings', body: { autoGreetingEnabled: true, autoGreetingTime: '09:30' }, expect: ['autoGreetingEnabled', 'autoGreetingTime'] },
  { id: 'S-06', path: '/office/iik78-settings', body: { inactivityThresholdDays: 41 }, expect: ['inactivityThresholdDays'] },
  { id: 'S-07', path: '/office/poa-expiry-settings', body: { poaExpiryThresholdDays: 33 }, expect: ['poaExpiryThresholdDays'] },
  { id: 'S-08', path: '/office/escalation-settings', body: { opReminderDays: 7 }, expect: ['opReminderDays'] },
]);

// S2 referans alanlari (F-B01-03): HTTP okuma yuzeyinde OMIT edilmeli.
const S2_FIELDS = [
  'escalationManagerLawyerIds', 'escalationFounderLawyerIds',
  'escalationTeamLeadLawyerIds', 'poaExpiryRecipientLawyerIds',
];
const SECRET_FIELDS = ['smtpPass', 'smsApiKey', 'smsApiSecret'];

/** Office satirinin TAM kopyasi (alan-alan karsilastirma icin). */
const readOfficeRow = (prisma, officeId) => prisma.office.findUniqueOrThrow({ where: { id: officeId } });

/** Iki satiri karsilastirir; `updatedAt` ve beklenen alanlar disinda FARK ARAMAZ. */
function unexpectedDiffs(before, after, expected) {
  const skip = new Set([...expected, 'updatedAt']);
  const diffs = [];
  for (const k of Object.keys(before)) {
    if (skip.has(k)) continue;
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b) diffs.push(`${k}: ${a} -> ${b}`);
  }
  return diffs;
}

(async () => {
  L.assertRunEnvironment();
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();
  const R = L.makeRecorder('A-03 (ayar yuzeyi PUT yazma kabulu)');

  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2

    const { admin: adminToken, staff: staffToken } = await L.resolveTokens(base, st);

    for (const s of SURFACES(st.runId)) {
      L.step(s.id, `PUT ${s.path}`);

      let before;
      try { before = await readOfficeRow(prisma, st.officeId); }
      catch (e) { R.unmeasured(`${s.id}.diff`, 'PUT oncesi satir okunamadi', e.message); continue; }

      // ── yetkili PUT ──
      const put = await L.httpJson('PUT', `${base}${s.path}`, { token: adminToken, body: s.body });
      if (put.indeterminate) {
        R.unmeasured(`${s.id}.write`, 'yetkili PUT', put.indeterminateReason);
        continue; // TEKRAR GONDERILMEZ
      }
      R.ok(`${s.id}.write`, 'yetkili PUT 2xx', put.status >= 200 && put.status < 300, `HTTP ${put.status}`);

      // ── yanitta S2 / acik secret var mi ──
      const rawBody = JSON.stringify(put.body || {});
      const leakedS2 = S2_FIELDS.filter((f) => rawBody.includes(`"${f}"`));
      R.ok(`${s.id}.s2`, 'yanitta S2 referans alani YOK', leakedS2.length === 0,
        leakedS2.length ? `SIZAN: ${leakedS2.join(', ')}` : 'S2 alani yok');
      const leakedSecret = SECRET_FIELDS.filter((f) => {
        const m = new RegExp(`"${f}"\\s*:\\s*"([^"]*)"`).exec(rawBody);
        return m && m[1] && !/^\*+$/.test(m[1]) && !m[1].includes('***');
      });
      R.ok(`${s.id}.secret`, 'yanitta ACIK secret YOK', leakedSecret.length === 0,
        leakedSecret.length ? `ACIK: ${leakedSecret.join(', ')}` : 'secret yok/maskeli');

      // ── YALNIZ hedef alan degisti mi (alan-alan) ──
      let after;
      try { after = await readOfficeRow(prisma, st.officeId); }
      catch (e) { R.unmeasured(`${s.id}.diff`, 'PUT sonrasi satir okunamadi', e.message); continue; }
      const diffs = unexpectedDiffs(before, after, s.expect);
      R.ok(`${s.id}.diff`, 'YALNIZ hedef alan degisti', diffs.length === 0,
        diffs.length ? `BEKLENMEYEN: ${diffs.join(' | ')}` : `yalniz ${s.expect.join(', ')} (+updatedAt)`);
      // "GERCEKTEN yazildi" = alan GONDERILEN degere ESIT. Onceki degerden FARKLI olmasini
      // SART KOSMAK yanlistir: gonderilen deger mevcut degerle ayni olabilir (ayni-boolean
      // durumu) ve bu bir kusur DEGILDIR. Ilk kosumda bu yanlis olcut S-05'i FAIL etti.
      const mismatched = s.expect.filter(
        (f) => JSON.stringify(after[f]) !== JSON.stringify(s.body[f]),
      );
      R.ok(`${s.id}.applied`, 'hedef alan GONDERILEN degere esit', mismatched.length === 0,
        mismatched.length
          ? `UYUSMAYAN: ${mismatched.map((f) => `${f} gonderilen=${JSON.stringify(s.body[f])} okunan=${JSON.stringify(after[f])}`).join(' | ')}`
          : s.expect.map((f) => `${f}=${JSON.stringify(after[f])}`).join(' · '));

      // ── yetkisiz (staffMember bagli aktor) 403 ──
      const denied = await L.httpJson('PUT', `${base}${s.path}`, { token: staffToken, body: s.body });
      const deniedCode = JSON.stringify(denied.body || {});
      R.ok(`${s.id}.403`, 'yetkisiz aktor 403 + OFFICE_F01_AUTHORIZATION_REQUIRED',
        denied.status === 403 && deniedCode.includes('OFFICE_F01_AUTHORIZATION_REQUIRED'),
        `HTTP ${denied.status} · ${deniedCode.slice(0, 90)}`);

      // ── anonim 401 ──
      const anon = await L.httpJson('PUT', `${base}${s.path}`, { body: s.body });
      R.ok(`${s.id}.401`, 'anonim 401', anon.status === 401, `HTTP ${anon.status}`);
    }

    // ── S-02: banka hesabi (ekle -> sil, ayni adimda net 0) ──
    L.step('S-02', 'POST/DELETE /office/bank-accounts');
    const created = await L.httpJson('POST', `${base}/office/bank-accounts`, {
      token: adminToken,
      body: { bankName: 'Kabul Bank', accountName: `OW ${st.runId}`, iban: 'TR330006100519786457841326' },
    });
    R.ok('S-02.create', 'yetkili POST 2xx', created.status >= 200 && created.status < 300, `HTTP ${created.status}`);
    // Id yanittan okunamazsa DB'den KENDI tenant'imiz icinde bulunur (yanit sekli
    // sozlesmenin bir parcasi DEGILDIR; ilk kosumda yanittan okunamayip OLCULEMEDI vermisti).
    let accId = (created.body && (created.body.id || (created.body.data && created.body.data.id))) || null;
    if (!accId) {
      const row = await prisma.officeBankAccount.findFirst({
        where: { officeId: st.officeId, accountName: `OW ${st.runId}` },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null);
      accId = row && row.id;
      if (accId) L.log(`      (id yanitta yoktu; DB'den okundu: kendi office'imiz icinde)`);
    }
    if (!accId) {
      R.unmeasured('S-02.delete', 'banka hesabi silinemedi', 'olusturulan kaydin id\'si ne yanitta ne DB\'de bulunabildi');
    } else {
      const del = await L.httpJson('DELETE', `${base}/office/bank-accounts/${accId}`, { token: adminToken });
      R.ok('S-02.delete', 'DELETE 2xx (net 0)', del.status >= 200 && del.status < 300, `HTTP ${del.status}`);
      const left = await prisma.officeBankAccount.count({ where: { officeId: st.officeId } });
      R.ok('S-02.net0', 'banka hesabi net etkisi 0', left === 0, `kalan kayit: ${left}`);
    }

    // ── IZLENEN TENANT'LARDA FARK 0 (seyirci dahil) ──
    L.step('A-03-ISO', 'izlenen tenant\'larda fark 0');
    const base0 = st.isolationBaseline.protectedTenants;
    if (!base0 || base0.length === 0) {
      R.unmeasured('A-03.iso', 'izolasyon karsilastirmasi', 'izlenen tenant kumesi BOS (A-02 §7)');
    } else {
      const changed = [];
      let measureError = null;
      for (const b of base0) {
        try {
          const t = await prisma.tenant.findFirst({ where: { slug: b.slug }, select: { id: true } });
          if (!t) { changed.push(`${b.slug}: TENANT YOK`); continue; }
          const now = {
            office: await prisma.office.count({ where: { tenantId: t.id } }),
            lawyer: await prisma.lawyer.count({ where: { tenantId: t.id } }),
            staff: await prisma.staffMember.count({ where: { tenantId: t.id } }),
            user: await prisma.user.count({ where: { tenantId: t.id } }),
            audit: await prisma.auditLog.count({ where: { tenantId: t.id } }),
          };
          for (const k of Object.keys(now)) if (now[k] !== b[k]) changed.push(`${b.slug}.${k}: ${b[k]} -> ${now[k]}`);
        } catch (e) { measureError = e; break; }
      }
      if (measureError) R.unmeasured('A-03.iso', 'izolasyon karsilastirmasi', measureError.message);
      else R.ok('A-03.iso', `izlenen ${base0.length} tenant FARK 0`, changed.length === 0,
        changed.length ? `DEGISTI: ${changed.join(' | ')}` : 'fark yok');
    }

    const sum = R.summary();
    console.log(JSON.stringify({ record: 'OFFICE-A-03', runId: st.runId, tenant: st.slug, ...sum, results: undefined }, null, 1));
    process.exitCode = (sum.fail === 0 && sum.unmeasured === 0) ? 0 : 3;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nA-03 HATASI:', e && e.stack ? e.stack : e); process.exitCode = 1; });
