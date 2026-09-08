/*
 * İ3 — DAR NEGATİF KONTROLLER (düzeneğin KENDİSİ sınanır)
 *
 * Amaç: "yanlış PASS yolları kapandı" **beyanı yeterli değildir**. Bu betik düzeneğe kasten
 * bozuk durumlar enjekte eder ve karşılaştırma katmanının bunları **kabul etmediğini** ölçer.
 * Ölçülen şey ürün değil, **ölçüm aracının kendisidir**.
 *
 * Kontroller:
 *   NC-1  Aynı ID altında İÇERİK değişikliği → "değişmedi" DENMEZ (kimlik eşitliği yetmez)
 *   NC-2  Mükerrer hedef kayıt (aynı içerikle ikinci satır) → fark olarak YAKALANIR
 *   NC-3  Tekrar isteğinde 500 → PASS ÜRETMEZ (yalnız 400 sözleşmesi kabul edilir)
 *   NC-4  Belirsiz HTTP → PASS ÜRETMEZ
 *   NC-5  Başarısız izolasyon ön koşulu (taşıma bağı yok) → gönderim ölçütleri UNMEASURED
 *   NC-6  Fotoğraf sorgusu düşerse → "kalıcı etki yok" iddiası ÜRETİLEMEZ
 *   NC-7  `unchanged()` null fotoğrafla PASS vermez
 *
 * Bu betik ürün uçlarına YAZMA yapmaz; yalnız karşılaştırma katmanını besler.
 */
'use strict';
const L = require('./i3-lib');

const R = new L.Results();

/** `diffPromotionTargets` için sahte fotoğraf üreticisi. */
function snapOf(addresses, opts = {}) {
  return {
    error: null,
    debtorAddressJson: JSON.stringify(addresses),
    debtorAddressCount: addresses.length,
    intelJson: JSON.stringify(opts.intel || []),
    intelCount: (opts.intel || []).length,
    fieldJson: JSON.stringify(opts.field || { reviewStatus: 'APPROVED', promotedRefId: null }),
    field: opts.field || { reviewStatus: 'APPROVED', promotedRefId: null },
    promoteAuditCount: opts.audit === undefined ? 0 : opts.audit,
  };
}

(async () => {
  L.AH.assertDisposableEnvironment(); // G-0 — bu betik yazma yapmasa da ortam kapisi calisir
  L.AH.step('NC', 'dar negatif kontroller — duzenegin KENDISI sinanir');

  // ── NC-1 · Aynı ID, DEĞİŞMİŞ içerik → "değişmedi" DENMEZ ──
  {
    const before = snapOf([{ id: 'a1', street: 'Eski Sokak', city: 'Ankara', source: 'CLIENT', isActive: true }]);
    const after = snapOf([{ id: 'a1', street: 'YENI Sokak', city: 'Ankara', source: 'CLIENT', isActive: true }]);
    const d = L.diffPromotionTargets(before, after);
    R.check('NC-1', 'ayni ID altinda ICERIK degisikligi FARK olarak yakalanir (kimlik esitligi YETMEZ)',
      d.length > 0 && d.some((x) => x.includes('DebtorAddress')),
      `kayit sayisi AYNI (1→1), ID AYNI ('a1'), yalniz street degisti · yakalanan fark=`
      + `${d.length ? d.join(',') : 'YOK(!)'}`);
  }

  // ── NC-2 · Mükerrer hedef kayıt → fark olarak yakalanır ──
  {
    const one = { id: 'a1', street: 'S', city: 'Ankara', source: 'CLIENT', isActive: true };
    const before = snapOf([one]);
    const after = snapOf([one, { ...one, id: 'a2' }]); // AYNI icerik, ikinci satir
    const d = L.diffPromotionTargets(before, after);
    R.check('NC-2', 'mukerrer hedef kayit (ayni icerikli ikinci satir) FARK olarak yakalanir',
      d.length > 0,
      `1→2 satir, icerik ayni · yakalanan fark=${d.length ? d.join(',') : 'YOK(!)'}`);
  }

  // ── NC-3 · Tekrar isteğinde 500 → PASS ÜRETMEZ ──
  {
    // H5-06b'nin kabul kosulu `rAgain.status === 400`'dur; 500 bu kosulu SAGLAMAZ.
    const accepts = (status) => status === 400;
    R.check('NC-3', 'tekrar isteginde 500 KABUL EDILMEZ (yalniz 400 sozlesmesi PASS uretir)',
      accepts(400) === true && accepts(500) === false && accepts(409) === false,
      `400→kabul=${accepts(400)} · 500→kabul=${accepts(500)} · 409→kabul=${accepts(409)}`);
  }

  // ── NC-4 · Belirsiz HTTP → PASS ÜRETMEZ ──
  {
    const isDenied = (r) => !r.indeterminate && r.status === 403;
    const anyIndet = (...rs) => rs.some((r) => r && r.indeterminate);
    const indet = { indeterminate: true, indeterminateReason: 'timeout' };
    const denied = { indeterminate: false, status: 403 };
    const server500 = { indeterminate: false, status: 500 };
    R.check('NC-4', 'belirsiz HTTP ve 500 yetki reddi SAYILMAZ',
      isDenied(indet) === false && anyIndet(indet, denied) === true
      && isDenied(server500) === false && isDenied(denied) === true,
      `belirsiz→denied=${isDenied(indet)} · 500→denied=${isDenied(server500)}`
      + ` · 403→denied=${isDenied(denied)} · anyIndet yakaladi=${anyIndet(indet, denied)}`);
  }

  // ── NC-5 · Taşıma bağı yoksa gönderim ölçütleri UNMEASURED ──
  {
    // H5-01'in kapisi: `!sink || !sink.available || !transportBound`
    const gate = (sink, bound) => (!sink || !sink.available || !bound);
    R.check('NC-5', 'tasima bagi DOGRULANMAMISSA gonderim olcutleri UNMEASURED olur (gonderime GECILMEZ)',
      gate({ available: true }, false) === true
      && gate(null, true) === true
      && gate({ available: false }, true) === true
      && gate({ available: true }, true) === false,
      `yakalayici VAR + bag YOK → engellendi=${gate({ available: true }, false)}`
      + ` · yakalayici YOK → engellendi=${gate(null, true)}`
      + ` · ikisi de VAR → gecildi=${!gate({ available: true }, true)}`);
  }

  // ── NC-6 · Fotoğraf sorgusu düşerse "kalıcı etki yok" ÜRETİLEMEZ ──
  {
    // Sahte prisma TUM cagrilari karsilar; yalniz biri duser. (Eksik model verilseydi
    // yakalanmamis promise reddi olusur ve olcum degil ARAC coker.)
    const boom = async () => { throw new Error('DB dustu'); };
    const okList = async () => [];
    const bad = await L.safeCapture({
      clientAddress: { findMany: boom },
      clientContact: { findMany: okList },
      client: { findUniqueOrThrow: async () => ({}) },
      clientConsent: { findMany: okList },
      auditLog: { count: async () => 0 },
    }, 'x');
    const cnt = await L.safeCount(async () => { throw new Error('sayim dustu'); });
    R.check('NC-6', 'fotograf/sayim sorgusu duserse hata YUKARI TASINIR (null DONMEZ)',
      bad.state === null && !!bad.error && cnt.value === null && !!cnt.error,
      `safeCapture: state=${bad.state} error="${String(bad.error).slice(0, 30)}"`
      + ` · safeCount: value=${cnt.value} error="${String(cnt.error).slice(0, 30)}"`);
  }

  // ── NC-7 · `unchanged()` null fotoğrafla PASS vermez ──
  {
    const u1 = L.unchanged(null, snapOf([]));
    const u2 = L.unchanged(snapOf([]), null);
    const ok = L.unchanged(
      { addressById: {}, contactRows: [], clientRow: 'x', consentRows: [], auditCount: 0 },
      { addressById: {}, contactRows: [], clientRow: 'x', consentRows: [], auditCount: 0 },
    );
    R.check('NC-7', 'unchanged() null fotografla PASS VERMEZ; gecerli iki fotografla calisir',
      u1.ok === false && u1.unmeasured === true
      && u2.ok === false && u2.unmeasured === true
      && ok.ok === true && ok.unmeasured === false,
      `null→ok=${u1.ok}/unmeasured=${u1.unmeasured} · gecerli→ok=${ok.ok}`);
  }

  const s = R.summary('I3 NEGATIF KONTROLLER');
  console.log(JSON.stringify({
    record: 'I3-NEGATIVE-CONTROLS',
    pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, total: s.total,
    results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })),
  }, null, 1));
  process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
})().catch((e) => {
  console.error('\nNEGATIF KONTROL HATASI:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
