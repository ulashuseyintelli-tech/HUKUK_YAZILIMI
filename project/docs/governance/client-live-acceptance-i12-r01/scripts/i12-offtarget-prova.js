/*
 * İ12 — HEDEF-DIŞI MESAJ KAPISI: HEDEFLİ İZOLE PROVA (deterministik; DB/API/canlı ortam GEREKTİRMEZ)
 *
 * `i12-live-measure-online.scanOffTarget` GERÇEK fonksiyonu ölçülür — kopya mantık YAZILMAZ
 * (kopya yazılırsa gerçek kapı bozulduğunda test yine geçer).
 *
 * Ölçülen sözleşme (owner kuralı "hedef dışı mesaj FAIL"):
 *   1. İzin kümesindeki alıcılara giden mesajlar temiz sayılır.
 *   2. İzin kümesi DIŞINDA tek bir alıcı bile → hedef-dışı (FAIL girdisi).
 *   3. `To:` başlığı okunamayan/olmayan mesaj da hedef-dışı sayılır (sessizce temiz SAYILMAZ).
 *   4. Çok alıcılı mesajda alıcılardan biri dışarıdaysa yakalanır.
 *   5. Büyük/küçük harf ve `TO:` varyasyonu kapıyı atlatamaz.
 *   6. Dizin okunamazsa `null` → ÖLÇÜLEMEDİ (asla "temiz").
 *
 * KULLANIM: node i12-offtarget-prova.js   (çıkış 0 = tüm ölçütler PASS)
 */
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { scanOffTarget } = require('./i12-live-measure-online');

const RUN = 'r0test01';
const ALLOWED = new Set([
  `deliv-${RUN}@ah-harness.invalid`,
  `fd-${RUN}@ah-harness.invalid`,
  `alici-${RUN}@ah-harness.invalid`,
]);

function mkdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'i12otg-')); }
function put(dir, name, body) { fs.writeFileSync(path.join(dir, name), body, 'utf8'); }
const msg = (to) => `From: noreply@ah-harness.invalid\r\nTo: ${to}\r\nSubject: test\r\n\r\ngovde\r\n`;

let pass = 0, fail = 0; const rows = [];
function check(id, desc, ok, observed) {
  ok ? pass++ : fail++;
  rows.push({ id, verdict: ok ? 'PASS' : 'FAIL', desc, observed });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${desc}\n       ${observed}`);
}

// 1) Yalnız izinli alıcılar → temiz
{
  const d = mkdir();
  put(d, 'msg-0001.txt', msg(`deliv-${RUN}@ah-harness.invalid`));
  put(d, 'msg-0002.txt', msg(`fd-${RUN}@ah-harness.invalid`));
  put(d, 'msg-0003.txt', msg(`alici-${RUN}@ah-harness.invalid`));
  put(d, 'conn-0001.txt', 'baglanti kaydi');          // conn-* sayılmamalı
  const r = scanOffTarget(d, ALLOWED);
  check('OTG-1', 'yalnız izinli alıcılar → hedef-dışı 0, toplam 3 (conn-* sayılmaz)',
    r !== null && r.offTarget.length === 0 && r.total === 3, `total=${r && r.total} offTarget=${r && r.offTarget.length}`);
}
// 2) GERÇEK dış alıcı → yakalanmalı
{
  const d = mkdir();
  put(d, 'msg-0001.txt', msg(`deliv-${RUN}@ah-harness.invalid`));
  put(d, 'msg-0002.txt', msg('gercek.muvekkil@ornekhukuk.com.tr'));   // canlı sızıntı senaryosu
  const r = scanOffTarget(d, ALLOWED);
  check('OTG-2', 'izin kümesi DIŞI gerçek alıcı YAKALANIR (FAIL girdisi)',
    r !== null && r.offTarget.length === 1 && /ornekhukuk\.com\.tr/.test(r.offTarget[0]),
    `offTarget=${JSON.stringify(r && r.offTarget)}`);
}
// 3) To: yok → hedef-dışı sayılır
{
  const d = mkdir();
  put(d, 'msg-0001.txt', 'From: x@y\r\nSubject: basliksiz\r\n\r\ngovde\r\n');
  const r = scanOffTarget(d, ALLOWED);
  check('OTG-3', 'To: başlığı OLMAYAN mesaj hedef-dışı sayılır (sessizce temiz DEĞİL)',
    r !== null && r.offTarget.length === 1 && /To-YOK/.test(r.offTarget[0]), `offTarget=${JSON.stringify(r && r.offTarget)}`);
}
// 4) Çok alıcı: biri dışarıda
{
  const d = mkdir();
  put(d, 'msg-0001.txt', msg(`deliv-${RUN}@ah-harness.invalid, sizinti@disarisi.net`));
  const r = scanOffTarget(d, ALLOWED);
  check('OTG-4', 'çok alıcılı mesajda DIŞARIDAKİ alıcı yakalanır',
    r !== null && r.offTarget.length === 1 && /disarisi\.net/.test(r.offTarget[0]), `offTarget=${JSON.stringify(r && r.offTarget)}`);
}
// 5) Harf büyüklüğü kapıyı atlatamaz
{
  const d = mkdir();
  put(d, 'msg-0001.txt', `TO: DELIV-${RUN.toUpperCase()}@AH-HARNESS.INVALID\r\n\r\ngovde`);
  const r = scanOffTarget(d, ALLOWED);
  check('OTG-5', 'büyük harfli `TO:` ve adres normalize edilir → temiz',
    r !== null && r.offTarget.length === 0 && r.total === 1, `offTarget=${r && r.offTarget.length} addresses=${JSON.stringify(r && r.addresses)}`);
}
// 6) Okunamayan dizin → null (ÖLÇÜLEMEDİ), "temiz" DEĞİL
{
  const r = scanOffTarget(path.join(os.tmpdir(), 'i12otg-OLMAYAN-DIZIN-xyz'), ALLOWED);
  check('OTG-6', 'okunamayan dizin → null (ÖLÇÜLEMEDİ); asla "temiz" sayılmaz', r === null, `donus=${r === null ? 'null' : JSON.stringify(r)}`);
}

console.log(JSON.stringify({ record: 'I12-OFFTARGET-PROVA', pass, fail, rows }, null, 1));
process.exitCode = fail > 0 ? 1 : 0;
