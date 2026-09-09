/*
 * CLIENT İ1b — DÜZENEĞİN KENDİSİNİ SINAYAN NEGATİF KONTROLLER
 *
 * GERÇEK kapı fonksiyonları üzerinde koşar (kopya mantık YOK). Amaç: canlı yazma onayı
 * verilmeden ÖNCE, kapıların yanlış ortama/yanlış tenant'a/onaysız canlıya yazmayı
 * GERÇEKTEN reddettiğini göstermek. NC-1…NC-6 DB GEREKTİRMEZ. NC-7 DB ister; yoksa
 * ÖLÇÜLEMEDİ olarak raporlanır — PASS SAYILMAZ.
 */
'use strict';
const L = require('./cl-lib');

const R = [];
const add = (id, title, verdict, detail) => {
  R.push({ id, verdict, title, detail });
  console.log(`  ${verdict === 'PASS' ? 'OK  ' : verdict === 'FAIL' ? 'FAIL' : '????'} ${id.padEnd(5)} ${title}\n         ${detail}`);
};
const pass = (id, t, ok, d) => add(id, t, ok ? 'PASS' : 'FAIL', d);
const unmeasured = (id, t, d) => add(id, t, 'UNMEASURED', d);

function gateResult(envVars) {
  const saved = {};
  for (const k of ['CL_ENVIRONMENT', 'CL_DATABASE_URL', 'CL_OWNER_GO_REF']) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, envVars);
  let out;
  try { out = { ok: true, value: L.assertEnvironment() }; }
  catch (e) { out = { ok: false, gate: e.gate || null, message: e.message }; }
  finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    for (const k of Object.keys(envVars)) if (saved[k] === undefined) delete process.env[k];
  }
  return out;
}
// Sahte URL'ler: parola alani 'x' — gercek sir DEGIL.
const LIVE_URL = 'postgresql://u:x@127.0.0.1:5432/hukuk_db?schema=public';
const DISP_URL = 'postgresql://u:x@127.0.0.1:5439/hukuk_fix1_test';

(async () => {
  console.log('\nCLIENT I1b — NEGATIF KONTROLLER (gercek kapilar)\n');

  // NC-1 · live + owner GO ref YOK → G-0 reddeder (canli yazma onaysiz BASLAMAZ)
  { const r = gateResult({ CL_ENVIRONMENT: 'live', CL_DATABASE_URL: LIVE_URL });
    pass('NC-1', 'live ortam, CL_OWNER_GO_REF YOK → G-0 reddeder', r.ok === false && r.gate === 'G-0',
      `ok=${r.ok} gate=${r.gate} · ${r.ok ? '' : r.message.slice(0, 90)}`); }
  // NC-2 · live + BICIMSIZ GO ref → reddeder
  { const r = gateResult({ CL_ENVIRONMENT: 'live', CL_DATABASE_URL: LIVE_URL, CL_OWNER_GO_REF: 'evet' });
    pass('NC-2', 'live ortam, bicimsiz GO ref → G-0 reddeder', r.ok === false && r.gate === 'G-0', `ok=${r.ok} gate=${r.gate}`); }
  // NC-3 · disposable ortamda CANLI DB → reddeder (yanlis hedefe yazma)
  { const r = gateResult({ CL_ENVIRONMENT: 'disposable', CL_DATABASE_URL: LIVE_URL });
    pass('NC-3', 'disposable ortam, canli 5432/hukuk_db → G-0 reddeder', r.ok === false && r.gate === 'G-0', `ok=${r.ok} · ${r.ok ? '' : r.message.slice(0, 80)}`); }
  // NC-4 · live ortamda DISPOSABLE DB (dogru GO ref ile) → reddeder (allowlist ortama ozel)
  { const r = gateResult({ CL_ENVIRONMENT: 'live', CL_DATABASE_URL: DISP_URL, CL_OWNER_GO_REF: 'OWNER-GO-CLIENT-I1B-20260910-R01' });
    pass('NC-4', 'live ortam, disposable 5439 → G-0 reddeder', r.ok === false && r.gate === 'G-0', `ok=${r.ok} · ${r.ok ? '' : r.message.slice(0, 80)}`); }
  // NC-5 · CL_ENVIRONMENT yok/bilinmiyor → reddeder (ortam belirsizse yazma baslamaz)
  { const r1 = gateResult({ CL_DATABASE_URL: LIVE_URL }); const r2 = gateResult({ CL_ENVIRONMENT: 'prod', CL_DATABASE_URL: LIVE_URL });
    pass('NC-5', 'CL_ENVIRONMENT yok/taninmiyor → G-0 reddeder', r1.ok === false && r2.ok === false, `yok→ok=${r1.ok} · prod→ok=${r2.ok}`); }
  // NC-6 · G-1: korunan slug, yabanci onekler, yanlis onek REDDEDILIR; dogru onek GECER
  { const rej = (s) => { try { L.assertOwnSlug(s); return false; } catch (e) { return /G-1/.test(e.message); } };
    const okGood = (() => { try { L.assertOwnSlug('cl-acc-0123abcd'); return true; } catch (e) { return false; } })();
    const all = ['telli-hukuk', 'demo-firma', 'ah-0123abcd', 'f04-acc-0123abcd', 'off-acc-0123abcd', 'o4-acc-0123abcd', 'i3-0123abcd', 'x-cl-acc-0123abcd'];
    const rejected = all.filter(rej);
    pass('NC-6', 'G-1: korunan/yabanci/yanlis onekli slug REDDEDILIR, dogru onek gecer', okGood && rejected.length === all.length,
      `reddedilen ${rejected.length}/${all.length} · cl-acc- gecti=${okGood}`); }
  // NC-6b · G-4: sir anahtari tasiyan durum nesnesi reddedilir
  { let ok = false; try { L.assertNoSecrets({ runId: 'a', nested: { password: 'x' } }); } catch (e) { ok = /G-4/.test(e.message); }
    let clean = true; try { L.assertNoSecrets({ runId: 'a', slug: 'b', passwordStored: false }); } catch (e) { clean = false; }
    pass('NC-6b', 'G-4: durum nesnesinde sir anahtari → reddedilir; temiz nesne gecer', ok && clean, `sirli→red=${ok} · temiz→gecti=${clean}`); }

  // NC-7 · kapatici, VAR OLMAYAN alan icin yazma 0 + fieldExists:false (DB gerekir)
  {
    const envName = (process.env.CL_ENVIRONMENT || '').toLowerCase();
    if (envName !== 'disposable' || !process.env.CL_DATABASE_URL) {
      unmeasured('NC-7', 'kapatici: olmayan alan → fieldExists:false, yazma 0', 'disposable DB verilmedi — OLCULEMEDI (PASS sayilmaz)');
    } else {
      let prisma = null;
      try {
        prisma = L.loadPrisma();
        const f = await L.findAcceptanceField(prisma, 'ffffffff');
        pass('NC-7', 'kapatici: olmayan alan → fieldExists:false, yazma 0', f.exists === false, `exists=${f.exists} slug=${f.slug}`);
      } catch (e) { unmeasured('NC-7', 'kapatici: olmayan alan', `DB'ye ulasilamadi: ${String(e && e.message).slice(0, 80)}`); }
      finally { if (prisma) await prisma.$disconnect().catch(() => {}); }
    }
  }

  const p = R.filter((x) => x.verdict === 'PASS').length, f = R.filter((x) => x.verdict === 'FAIL').length, u = R.filter((x) => x.verdict === 'UNMEASURED').length;
  console.log(`\nI1b NEGATIF KONTROLLER: PASS ${p} · FAIL ${f} · OLCULEMEYEN ${u}  (toplam ${R.length})`);
  console.log(JSON.stringify({ record: 'CL-I1B-NEGATIVE', pass: p, fail: f, unmeasured: u, results: R }, null, 1));
  process.exitCode = f > 0 ? 1 : (u > 0 ? 3 : 0);
})().catch((e) => { console.error('NEGATIF KONTROL HATASI:', e && e.message); process.exitCode = 1; });
