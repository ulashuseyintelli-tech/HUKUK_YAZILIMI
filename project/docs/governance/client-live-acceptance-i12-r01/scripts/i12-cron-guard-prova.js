/*
 * İ12 — AYLIK CRON ÇAKIŞMA KORUMASI: HEDEFLİ İZOLE PROVA (deterministik; DB/API/ortam GEREKTİRMEZ)
 *
 * `i12-live-cron-guard.windowOverlapsFire` sabit anlarla ölçülür. Europe/Istanbul UTC+3'tür (DST yok),
 * bu yüzden ayın 1'i 03:00 Istanbul == ayın 1'i 00:00 UTC. Sınır durumu (pencere TAM ateşleme anında
 * biter) ÇAKIŞMA sayılır — fail-closed.
 *
 * KULLANIM: node i12-cron-guard-prova.js   (çıkış 0 = tüm ölçütler PASS)
 */
'use strict';
const G = require('./i12-live-cron-guard');

const CASES = [
  { now: '2026-09-15T10:00:00Z', win: 120, expect: false, desc: 'ay ortası — çakışma yok' },
  { now: '2026-09-30T21:00:00Z', win: 120, expect: false, desc: 'pencere ateşlemeden 1 sa önce biter' },
  { now: '2026-09-30T22:00:00Z', win: 120, expect: true,  desc: 'SINIR: pencere tam ateşleme anında biter → ÇAKIŞIR (fail-closed)' },
  { now: '2026-09-30T23:30:00Z', win: 60,  expect: true,  desc: 'pencere ateşlemeyi kapsar' },
  { now: '2026-10-01T00:30:00Z', win: 120, expect: false, desc: 'ateşleme GEÇTİ — sonraki ay uzakta' },
  { now: '2026-12-31T23:00:00Z', win: 180, expect: true,  desc: 'yıl dönümü: 1 Ocak 03:00 Istanbul kapsanır' },
  { now: '2027-02-28T20:00:00Z', win: 120, expect: false, desc: 'ay sonu (Şubat) — 1 Mart ateşlemesi kapsanmaz' },
];

let pass = 0, fail = 0;
const rows = [];
for (const c of CASES) {
  const now = new Date(c.now);
  const r = G.windowOverlapsFire(now, c.win);
  const ok = r.overlaps === c.expect;
  ok ? pass++ : fail++;
  rows.push({ verdict: ok ? 'PASS' : 'FAIL', desc: c.desc, now: c.now, windowMinutes: c.win, nextFire: r.fire.toISOString(), overlaps: r.overlaps, expected: c.expect });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${c.desc}\n       now=${c.now} pencere=${c.win}dk → ateşleme=${r.fire.toISOString()} çakışma=${r.overlaps} (beklenen ${c.expect})`);
}
// Ateşleme anı her zaman ayın 1'i 03:00 Istanbul olmalı (tz doğruluğu)
const probe = G.nextMonthlyFire(new Date('2026-07-10T12:00:00Z'));
const p = G.tzParts(probe, G.TZ);
const tzOk = p.day === 1 && p.hour === 3 && p.minute === 0;
tzOk ? pass++ : fail++;
rows.push({ verdict: tzOk ? 'PASS' : 'FAIL', desc: 'ateşleme Istanbul yerel saatinde ayın 1’i 03:00', observed: `${p.year}-${p.month}-${p.day} ${p.hour}:${String(p.minute).padStart(2, '0')}` });
console.log(`${tzOk ? 'PASS' : 'FAIL'} | ateşleme Istanbul yerelinde ayın 1'i 03:00 → ${p.year}-${p.month}-${p.day} ${p.hour}:${String(p.minute).padStart(2, '0')}`);

console.log(JSON.stringify({ record: 'I12-CRON-GUARD-PROVA', pass, fail, rows }, null, 1));
process.exitCode = fail > 0 ? 1 : 0;
