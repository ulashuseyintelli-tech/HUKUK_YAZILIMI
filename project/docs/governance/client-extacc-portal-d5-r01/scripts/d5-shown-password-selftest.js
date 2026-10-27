'use strict';
/*
 * EXTACC D-5 R05 — OWNER'A GÖSTERİLEN SINAMA PAROLASI öz-testi (yalnız değişen davranış; DB / ağ / canlı YOK).
 * 052788e6 koşumunda S1 yeni parolayla 401 aldı; sıfırlama formuna giden değer konsol değerinden farklıydı (yol ayrılamadı,
 * Ek 137). R05 yalnız parolanın ÜRETİMİNİ ve GÖSTERİMİNİ değiştirir: girintisiz tek satır, karışan karakter ve sözcük ayırıcı yok,
 * rastgelelik önceki 96 bitten az değil. Ürün parola politikası ve kabul ölçütleri DEĞİŞMEZ.
 * KULLANIM: node d5-shown-password-selftest.js [koşucu yolu]   (varsayılan: aynı dizindeki d5-portal-reset-live-run.js)
 * ÇIKIŞ   : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const RUN = path.resolve(process.argv[2] || path.join(__dirname, 'd5-portal-reset-live-run.js'));
const rows = []; const check = (id, desc, ok, obs) => rows.push({ id, desc, ok: !!ok, obs });

const SHAPE = /^D5N[A-HJ-NP-Z2-9]{20}$/;
const AMBIGUOUS = /[0O1Il]/;
// Windows Terminal varsayılan sözcük ayırıcıları (belge bilgisi) + boşluk türleri: parolada hiçbiri olmamalı → çift tık tamamını seçer.
const WT_DELIMS = ' /\\()"\'-.,:;<>~!@#$%^&*|+=[]{}?│\t ';
const OLD_BITS = 12 * 8; // R04: 'D5n!' + randomBytes(12).toString('base64url')
const PORTAL_PASSWORD_MIN_LENGTH = 8; // apps/api/src/modules/portal/dto/portal-password.dto.ts (değişmedi)

let EX; let src;
try { src = fs.readFileSync(RUN, 'utf8'); EX = require(RUN); } catch (e) { console.log(`OLCULEMEDI: koşucu yüklenemedi (${String(e.message || e).slice(0, 200)})`); process.exit(2); }
const gen = EX.makeShownPassword; const alpha = EX.SHOWN_PW_ALPHABET; const rlen = EX.SHOWN_PW_RANDOM_LEN;

check('SP-1', 'üretici koşucudan dışa açık; alfabe 32 farklı karakter, karışan 0 O 1 I l YOK, sözcük ayırıcı YOK',
  typeof gen === 'function' && typeof alpha === 'string' && new Set(alpha).size === 32 && alpha.length === 32 && !AMBIGUOUS.test(alpha) && ![...alpha].some((c) => WT_DELIMS.includes(c)),
  `üretici=${typeof gen} · alfabe=${alpha ? alpha.length : 'yok'}`);
const bits = typeof rlen === 'number' && alpha ? rlen * Math.log2(alpha.length) : 0;
check('SP-2', `rastgelelik önceki düzeyden az değil (≥ ${OLD_BITS} bit)`, bits >= OLD_BITS, `${bits} bit (önceki ${OLD_BITS})`);

const N = 20000; let shapeBad = 0; let delimBad = 0; let ambBad = 0; let policyBad = 0; const seen = new Set(); const counts = {};
if (typeof gen === 'function') {
  for (let i = 0; i < N; i++) {
    const p = gen(); seen.add(p);
    if (!SHAPE.test(p)) shapeBad++;
    if ([...p].some((c) => WT_DELIMS.includes(c)) || p !== p.trim()) delimBad++;
    if (AMBIGUOUS.test(p)) ambBad++;
    if (p.length < PORTAL_PASSWORD_MIN_LENGTH) policyBad++;
    for (const c of p.slice(3)) counts[c] = (counts[c] || 0) + 1;
  }
}
check('SP-3', `${N} üretim: biçim D5N + 20 karakter (yalnız alfabe); boşluk / ayırıcı / karışan karakter 0; ürün politikası (≥ ${PORTAL_PASSWORD_MIN_LENGTH}) karşılanır; tekrar 0`,
  typeof gen === 'function' && shapeBad === 0 && delimBad === 0 && ambBad === 0 && policyBad === 0 && seen.size === N,
  `biçim dışı=${shapeBad} · ayırıcı/boşluk=${delimBad} · karışan=${ambBad} · politika dışı=${policyBad} · farklı=${seen.size}/${N}`);
// Dağılım: her karakter beklenen sayıya ±6 standart sapma içinde (sapmasız `bayt & 31` için).
const exp = (N * 20) / 32; const sd = Math.sqrt(exp * (31 / 32)); const keys = Object.keys(counts);
const worst = keys.length ? Math.max(...keys.map((k) => Math.abs(counts[k] - exp) / sd)) : Infinity;
check('SP-4', 'karakter dağılımı düzgün (32 karakterin hepsi görülür; en büyük sapma < 6 standart sapma)', keys.length === 32 && worst < 6, `görülen=${keys.length} · en büyük sapma=${worst.toFixed(2)} sd`);

// Kaynak (yorumlar hariç): yeni parola üreticiden gelir; 2. konsolda GİRİNTİSİZ tek satır; başka yerde gösterilmez; ilk parola değişmedi.
const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const showLines = code.split('\n').filter((l) => /\$\{newPw\}/.test(l));
check('SP-5', 'yeni parola makeShownPassword() ile üretilir; 2. konsolda tek öğe `${newPw}` (girinti / ek boşluk YOK); başka satırda gösterilmez; ilk parola üretimi değişmedi',
  /const newPw = makeShownPassword\(\); addSecret\(newPw\);/.test(code) && showLines.length === 1 && /, `\$\{newPw\}`, /.test(showLines[0]) && !/`\s+\$\{newPw\}|\$\{newPw\}\s+`/.test(code)
    && /const initialPw = 'D5i!' \+ crypto\.randomBytes\(12\)\.toString\('base64url'\); addSecret\(initialPw\);/.test(code) && !/'D5n!'/.test(code),
  `gösterim satırı=${showLines.length}`);
// d5-selftest.js telefon taklidi gösterimsiz test dosyasından yeni biçimi GİRİNTİSİZ satır olarak okur (eski girintili biçimi okumaz).
const st = fs.readFileSync(path.join(path.dirname(RUN), 'd5-selftest.js'), 'utf8'); const m = st.match(/match\((\/\^\(D5N[^)]*\)\$\/m)\)/);
let sinkOk = false; let sinkObs = 'desen yok';
if (m && typeof gen === 'function') {
  const re = new RegExp(m[1].slice(1, -2), 'm'); const p = gen();
  const fresh = ['', '== (2/2) ==', 'şunu girin:', p, ''].join('\n'); const indented = ['şunu girin:', `    ${p}`].join('\n');
  const got = fresh.match(re); sinkOk = !!got && got[1] === p && !re.test(indented); sinkObs = `yeni biçim okundu=${!!got && got[1] === p} · girintili satır okunmadı=${!re.test(indented)}`;
}
check('SP-6', 'd5-selftest.js telefon taklidi: girintisiz satırı okur, girintili satırı OKUMAZ (gösterim biçimi uçtan uca sınanır)', sinkOk, sinkObs);

for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.desc}\n        ${r.obs}`);
const fail = rows.filter((r) => !r.ok).length;
console.log(`\nEXTACC D-5 R05 GÖSTERİLEN PAROLA ÖZ-TESTİ: PASS ${rows.length - fail} / ${rows.length}`);
console.log(`  test edilen koşucu: ${path.basename(RUN)} sha256=${crypto.createHash('sha256').update(fs.readFileSync(RUN)).digest('hex').toUpperCase()} · node=${process.version}`);
console.log('  (parola değerleri yazdırılmaz; DB / ağ / canlı KULLANILMADI)');
process.exit(fail > 0 ? 1 : 0);
