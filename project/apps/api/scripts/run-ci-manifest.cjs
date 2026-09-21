#!/usr/bin/env node
'use strict';
/**
 * GH-05 / 2026-09-21: manifest'in spec listesini Jest'e KOMUT SATIRI uzerinden degil
 * Node API'si (`jest.runCLI`) ile verir.
 *
 * NEDEN: spec listesi argv'ye yazildiginda Windows'ta iki ayri sinir vuruluyor —
 *   * `npx jest ...` cmd.exe shim'i uzerinden gittigi icin ~8191 karakter (db/domain-integration
 *     84 dosya ≈ 8.0 kB'de "The syntax of the command is incorrect"; Jest HIC baslamiyor),
 *   * CreateProcess'in 32 kB siniri (pure/platform-scripts-shared 482 dosya ≈ 38.5 kB).
 * Linux'ta sinir cok daha yuksek oldugu icin ayni liste sorunsuz kosuyordu; yani hata
 * platforma bagliydi, secime degil.
 *
 * SECIM VE BAYRAKLAR AYNEN KORUNUR: `--ci --forceExit --runInBand --runTestsByPath <liste>`
 * degerleri runCLI'ye birebir ayni anlamla verilir. Test bolme, atlama, desen daraltma,
 * `passWithNoTests` YOK. Ek bagimlilik YOK (jest zaten kurulu).
 *
 * Fail-closed kontroller: manifest bos/eksik olamaz, her spec dosyasi var olmali,
 * kosan suite sayisi manifest sayisina ESIT olmali.
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.resolve(__dirname, '..');
const name = process.argv[2];

function fail(msg) {
  console.log(`CI-MANIFEST FAIL: ${msg}`);
  process.exit(1);
}

if (!name) fail('usage: run-ci-manifest.cjs <manifest-name> --ci --forceExit --runInBand --runTestsByPath');

// Bayraklar cagrida ACIKCA verilir ve burada ZORUNLU tutulur: kabuk tarafindaki
// metin ile gercekte kosan secim/bayrak kumesi ayrisamaz (guard'lar kabugu okur).
const REQUIRED_FLAGS = ['--ci', '--forceExit', '--runInBand', '--runTestsByPath'];
const flags = process.argv.slice(3);
const missing = REQUIRED_FLAGS.filter((f) => !flags.includes(f));
const unexpected = flags.filter((f) => !REQUIRED_FLAGS.includes(f));
if (missing.length) fail(`eksik bayrak: ${missing.join(' ')}`);
if (unexpected.length) fail(`beklenmeyen bayrak: ${unexpected.join(' ')}`);

const manifestPath = path.join(API_DIR, 'ci-manifests', `${name}.txt`);
if (!fs.existsSync(manifestPath)) fail(`manifest bulunamadi: ${manifestPath}`);

// db/* manifestleri GERCEK DB ister. Bos/eksik TEST_DATABASE_URL'de `describeDb` suite'leri
// sessizce atlar ve manifest yesil gorunurdu; 2026-09-21'de tasinan dogrudan DB adimlarinin
// "BLOCKED: TEST_DATABASE_URL is required" kapisi burada korunur (fail-closed).
if (name.startsWith('db/') && !(process.env.TEST_DATABASE_URL || '').trim()) {
  fail(`${name} icin TEST_DATABASE_URL zorunlu (db/* manifesti gercek DB ister)`);
}

const specs = fs
  .readFileSync(manifestPath, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

if (specs.length === 0) fail(`${name} hic spec listelemiyor`);
if (new Set(specs).size !== specs.length) fail(`${name} ayni spec'i birden fazla listeliyor`);

process.chdir(API_DIR);
for (const f of specs) {
  if (!fs.existsSync(path.join(API_DIR, f))) {
    console.log(`MISSING spec in ${name}: ${f}`);
    process.exit(1);
  }
}

console.log(`CI-MANIFEST ${name}: ${specs.length} spec`);

const { runCLI } = require('jest');

runCLI(
  {
    ci: true,
    forceExit: true,
    runInBand: true,
    runTestsByPath: true,
    _: specs,
    $0: 'jest',
  },
  [API_DIR],
)
  .then(({ results }) => {
    // Secim kaymasi fail-closed yakalanir: kosan suite sayisi manifest ile ESIT olmali.
    if (results.numTotalTestSuites !== specs.length) {
      console.log(
        `CI-MANIFEST FAIL: ${name} secim uyusmazligi — manifest ${specs.length}, kosan ${results.numTotalTestSuites}`,
      );
      process.exit(1);
    }
    process.exit(results.success ? 0 : 1);
  })
  .catch((err) => {
    console.log(`CI-MANIFEST FAIL: ${name} calistirilamadi: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
