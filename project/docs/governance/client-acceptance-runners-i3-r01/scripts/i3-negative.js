/*
 * İ3 — DAR NEGATİF KONTROLLER (düzeneğin KENDİSİ sınanır)
 *
 * KOPYA MANTIK YOK. Kontroller, ölçüt modüllerinin kullandığı **gerçek** karar
 * fonksiyonlarını (`i3-lib.decide.*`) ve gerçek karşılaştırma katmanını (`diffPromotionTargets`,
 * `safeCapture`, `safeCount`, `unchanged`) çağırır. Testin içinde yeniden yazılmış bir
 * `accepts`/`isDenied`/`gate` olsaydı, gerçek kapı bozulduğunda test YİNE GEÇERDİ — yani
 * kendi kendini onaylardı.
 *
 * MUTASYON KANITI: her kontrol için gerçek kapı **geçici olarak bozulur**, ilgili negatif
 * kontrolün KIRILDIĞI gösterilir ve düzeltme geri konur. Böylece "bu kontrol gerçekten bir şey
 * ölçüyor" iddiası kanıtlanır.
 */
'use strict';
const L = require('./i3-lib');

const R = new L.Results();

/** `diffPromotionTargets` için gerçek şekilde fotoğraf. */
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

/**
 * Gerçek kapıyı geçici olarak bozar, verilen iddiayı yeniden değerlendirir, sonra düzeltmeyi
 * GERİ KOYAR. Dönen `brokenResult`, bozukken iddianın ne olduğunu söyler.
 */
function withBrokenGate(obj, key, brokenImpl, assertFn) {
  const original = obj[key];
  let brokenResult;
  try {
    obj[key] = brokenImpl;
    brokenResult = assertFn();
  } finally {
    obj[key] = original; // DUZELTME GERI KONUR
  }
  return { brokenResult, restored: obj[key] === original };
}

(async () => {
  L.AH.assertDisposableEnvironment(); // G-0
  L.AH.step('NC', 'dar negatif kontroller — GERCEK karar fonksiyonlari uzerinde');

  // ── NC-1 · Aynı ID, DEĞİŞMİŞ içerik → gerçek diff yakalar ──
  {
    const before = snapOf([{ id: 'a1', street: 'Eski', city: 'Ankara', source: 'CLIENT', isActive: true }]);
    const after = snapOf([{ id: 'a1', street: 'YENI', city: 'Ankara', source: 'CLIENT', isActive: true }]);
    const d = L.diffPromotionTargets(before, after);
    R.check('NC-1', 'GERCEK diffPromotionTargets: ayni ID + degismis icerik FARK olarak yakalanir',
      d.length > 0 && d.some((x) => x.includes('DebtorAddress')),
      `sayi 1→1, ID ayni, yalniz street degisti · fark=${d.length ? d.join(',') : 'YOK(!)'}`);
  }

  // ── NC-2 · Mükerrer hedef kayıt → gerçek diff yakalar ──
  {
    const one = { id: 'a1', street: 'S', city: 'Ankara', source: 'CLIENT', isActive: true };
    const d = L.diffPromotionTargets(snapOf([one]), snapOf([one, { ...one, id: 'a2' }]));
    R.check('NC-2', 'GERCEK diffPromotionTargets: mukerrer hedef kayit FARK olarak yakalanir',
      d.length > 0, `1→2 satir, icerik ayni · fark=${d.length ? d.join(',') : 'YOK(!)'}`);
  }

  // ── NC-3 · Tekrar sözleşmesi: GERÇEK `decide.acceptsRepeatContract` ──
  {
    const r400 = { indeterminate: false, status: 400, body: { message: 'Alan zaten promote edilmiş' } };
    const r500 = { indeterminate: false, status: 500 };
    const r409 = { indeterminate: false, status: 409 };
    const rInd = { indeterminate: true, indeterminateReason: 'timeout' };
    const real = L.decide.acceptsRepeatContract;
    const ok = real(r400) === true && real(r500) === false
      && real(r409) === false && real(rInd) === false;

    // MUTASYON: kapiyi "her 4xx/5xx kabul" haline getir → NC kirilmali.
    const m = withBrokenGate(L.decide, 'acceptsRepeatContract',
      (r) => !!r && r.status >= 400,
      () => L.decide.acceptsRepeatContract(r500) === false);

    R.check('NC-3', 'GERCEK acceptsRepeatContract: yalniz 400 kabul; 500/409/belirsiz RED — kapi bozulunca KIRILIR',
      ok && m.brokenResult === false && m.restored,
      `400=${real(r400)} · 500=${real(r500)} · 409=${real(r409)} · belirsiz=${real(rInd)}`
      + ` · MUTASYON(">=400 kabul"): iddia bozukken=${m.brokenResult} (false = NC kirildi, dogru)`
      + ` · duzeltme geri kondu=${m.restored}`);
  }

  // ── NC-4 · Yetki reddi: GERÇEK `decide.isDenied` / `anyIndeterminate` ──
  {
    const rInd = { indeterminate: true, indeterminateReason: 'timeout' };
    const r403 = { indeterminate: false, status: 403 };
    const r500 = { indeterminate: false, status: 500 };
    const ok = L.decide.isDenied(rInd) === false && L.decide.isDenied(r500) === false
      && L.decide.isDenied(r403) === true
      && L.decide.anyIndeterminate(rInd, r403) === true
      && L.decide.anyIndeterminate(r403, r500) === false;

    // MUTASYON: `isDenied` 500'u de reddedilmis saysin → NC kirilmali.
    const m = withBrokenGate(L.decide, 'isDenied',
      (r) => !!r && r.status >= 400,
      () => L.decide.isDenied(r500) === false);

    R.check('NC-4', 'GERCEK isDenied: yalniz 403; belirsiz ve 500 SAYILMAZ — kapi bozulunca KIRILIR',
      ok && m.brokenResult === false && m.restored,
      `403=${L.decide.isDenied(r403)} · 500=${L.decide.isDenied(r500)} · belirsiz=${L.decide.isDenied(rInd)}`
      + ` · MUTASYON(">=400 red"): iddia bozukken=${m.brokenResult} (false = NC kirildi, dogru)`
      + ` · duzeltme geri kondu=${m.restored}`);
  }

  // ── NC-5 · Gönderim kapısı: GERÇEK `decide.blocksSending` ──
  {
    const ok = L.decide.blocksSending({ available: true }, false) === true
      && L.decide.blocksSending(null, true) === true
      && L.decide.blocksSending({ available: false }, true) === true
      && L.decide.blocksSending({ available: true }, true) === false;

    // MUTASYON: kapi yalniz `sink` yoklugunu kontrol etsin (tasima bagini YOK SAYSIN).
    const m = withBrokenGate(L.decide, 'blocksSending',
      (sink) => !sink,
      () => L.decide.blocksSending({ available: true }, false) === true);

    R.check('NC-5', 'GERCEK blocksSending: tasima bagi yoksa gonderim ENGELLENIR — kapi bozulunca KIRILIR',
      ok && m.brokenResult === false && m.restored,
      `yakalayici VAR+bag YOK→engel=${L.decide.blocksSending({ available: true }, false)}`
      + ` · ikisi de VAR→gecis=${!L.decide.blocksSending({ available: true }, true)}`
      + ` · MUTASYON("bagi yok say"): iddia bozukken=${m.brokenResult} (false = NC kirildi, dogru)`
      + ` · duzeltme geri kondu=${m.restored}`);
  }

  // ── NC-6 · GERÇEK `safeCapture`/`safeCount`: sorgu düşerse null DÖNMEZ ──
  {
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
    R.check('NC-6', 'GERCEK safeCapture/safeCount: sorgu duserse {error} doner, null DONMEZ',
      bad.state === null && !!bad.error && cnt.value === null && !!cnt.error,
      `safeCapture state=${bad.state} error="${String(bad.error).slice(0, 26)}"`
      + ` · safeCount value=${cnt.value} error="${String(cnt.error).slice(0, 26)}"`);
  }

  // ── NC-7 · GERÇEK `unchanged`: null fotoğrafla PASS vermez ──
  {
    const valid = { addressById: {}, contactRows: [], clientRow: 'x', consentRows: [], auditCount: 0 };
    const u1 = L.unchanged(null, valid);
    const u2 = L.unchanged(valid, null);
    const okCase = L.unchanged(valid, valid);
    R.check('NC-7', 'GERCEK unchanged: null fotografla PASS VERMEZ (unmeasured), gecerli ikili ile calisir',
      u1.ok === false && u1.unmeasured === true && u2.ok === false && u2.unmeasured === true
      && okCase.ok === true && okCase.unmeasured === false,
      `null→ok=${u1.ok}/unmeasured=${u1.unmeasured} · gecerli→ok=${okCase.ok}`);
  }

  // ── NC-8 · Hata sözleşmesi TAM eşleşme: GERÇEK `decide.matchesExactCode` ──
  {
    const stale = { indeterminate: false, status: 409, body: { code: 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT' } };
    const hash = { indeterminate: false, status: 409, body: { code: 'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH' } };
    const generic = { indeterminate: false, status: 409, body: {} };
    const real = L.decide.matchesExactCode;
    const ok = real(stale, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT') === true
      && real(hash, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT') === false
      && real(generic, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT') === false;

    // MUTASYON: "alternatif kabul" (STALE VEYA CONTENT_HASH) → iki senaryo AYRISMAZ.
    const m = withBrokenGate(L.decide, 'matchesExactCode',
      (r) => {
        const c = String((r && r.body && r.body.code) || '');
        return c.includes('STALE') || c.includes('CONTENT_HASH_MISMATCH');
      },
      () => L.decide.matchesExactCode(hash, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT') === false);

    R.check('NC-8', 'GERCEK matchesExactCode: alternatif kod KABUL EDILMEZ — "STALE veya CONTENT_HASH" mutasyonu KIRAR',
      ok && m.brokenResult === false && m.restored,
      `STALE→STALE=${real(stale, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT')}`
      + ` · CONTENT_HASH→STALE=${real(hash, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT')}`
      + ` · kodsuz→STALE=${real(generic, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT')}`
      + ` · MUTASYON("alternatif kabul"): iddia bozukken=${m.brokenResult} (false = NC kirildi, dogru)`
      + ` · duzeltme geri kondu=${m.restored}`);
  }

  const s = R.summary('I3 NEGATIF KONTROLLER');
  console.log(JSON.stringify({
    record: 'I3-NEGATIVE-CONTROLS',
    pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, total: s.total,
    mutationProofs: ['NC-3', 'NC-4', 'NC-5', 'NC-8'],
    results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })),
  }, null, 1));
  process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
})().catch((e) => {
  console.error('\nNEGATIF KONTROL HATASI:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
