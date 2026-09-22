'use strict';
// C123 bakim duzeltmesi dogrulamasi — SENTETIK veri, DB baglantisi YOK, canli kabul YOK.
// assertRunEnvironment yalnizca URL ayristirir; ag/DB erisimi yapmaz.
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = __dirname;
const L = require(S + '/c-lib');

// Sentetik ornek ref PARCALARDAN uretilir: bu dosya desen taramalarinda literal TASIMAZ ve
// repo genelinde 'tuketilmis ref' kontrolunu yanlislikla tetiklemez.
const FAKE_GO = ['OWNER', 'GO', 'OFFICE', 'C123', '19990101', 'R09'].join('-');
const out = [];
function chk(id, ok, detail) { out.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + ' · ' + detail); }

// 1) live dalinda donen nesne GO ref LITERALI tasimamali, sha256 tasimali.
Object.assign(process.env, {
  C123_ENVIRONMENT: 'live',
  C123_CONFIRM_LIVE: 'YES-LIVE-OFFICE-ACCEPTANCE-C123',
  C123_OWNER_GO_REF: FAKE_GO,
  C123_DATABASE_URL: 'postgresql://sentetik:sentetik@127.0.0.1:5432/hukuk_db',
  C123_API_BASE_URL: 'http://127.0.0.1:8080/api',
});
const env = L.assertRunEnvironment();
const envText = JSON.stringify(env);
chk('ENV-NO-LITERAL', !envText.includes(FAKE_GO), 'donen ortam nesnesinde literal yok');
const crypto = require('crypto');
const expected = crypto.createHash('sha256').update(FAKE_GO).digest('hex').toUpperCase();
chk('ENV-SHA', env.goRefSha256 === expected, 'goRefSha256 beklenen sha256 ile esit');

// 2) bicim kapisi hatasi girilen degeri YAZDIRMAMALI.
process.env.C123_OWNER_GO_REF = 'OWNER-GO-OFFICE-C123-BOZUK';
let msg = '';
try { L.assertRunEnvironment(); } catch (e) { msg = e.message; }
chk('GATE-NO-ECHO', msg.includes('bicimi gecersiz') && !msg.includes('BOZUK'), 'hata iletisi girilen degeri tasimiyor');
process.env.C123_OWNER_GO_REF = FAKE_GO;

// 3) cikti yazici FAIL-CLOSED: literal tasiyan nesne yazilamaz, dosya OLUSMAZ.
const tmp = path.join(os.tmpdir(), 'c123-fix-verify-' + Date.now() + '.json');
let threw = false;
try { L.writeJsonNoSecrets(tmp, { note: 'CANLI KOSUM · GO ' + FAKE_GO }); } catch (e) { threw = /GO ref literali/.test(e.message) && !e.message.includes(FAKE_GO); }
chk('WRITE-FAIL-CLOSED', threw && !fs.existsSync(tmp), 'literal iceren yazma reddedildi ve dosya olusmadi');

// 4) maskeli nesne yazilabilmeli.
const tmp2 = path.join(os.tmpdir(), 'c123-fix-verify-ok-' + Date.now() + '.json');
L.writeJsonNoSecrets(tmp2, { environment: env, note: 'CANLI KOSUM · GO ref sha256 ' + env.goRefSha256 });
const written = fs.readFileSync(tmp2, 'utf8');
chk('WRITE-OK', !written.includes(FAKE_GO) && written.includes(expected), 'maskeli cikti yazildi, literal yok');
fs.unlinkSync(tmp2);

const fail = out.filter((r) => !r.ok).length;
console.log('\nC123 BAKIM DOGRULAMA: PASS ' + (out.length - fail) + ' / FAIL ' + fail);
process.exitCode = fail === 0 ? 0 : 1;
