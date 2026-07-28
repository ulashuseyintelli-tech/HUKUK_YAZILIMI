'use strict';

/**
 * GOV-TASK-REVISION-CONTRACT-RECONCILIATION-R01 — contract uzlasma testleri.
 *
 * Contract V2 immutability'yi `taskId` eksenine bagliyordu. Bir task'in
 * implementation/test tasarimi superseded oldugunda veya base ilerledigunde
 * "yeni spec gerekiyor" cumlesi "bu task bitti" gibi okunuyordu — sahada
 * serbest metin `BLOCKED — HANDOFF REQUIRED` uretti.
 *
 * Bu dosya, uzlasmanin belgede GERCEKTEN durdugunu ve uc katmanin (AGENTS.md
 * cekirdegi · process-rules detayi · contract) birbiriyle tutarli kaldigini
 * dogrular. Metin testi olmasinin sebebi basit: ajan bu cumleleri okuyup
 * davraniyor, kod okumuyor.
 *
 * Cagrildigi yer: .github/workflows/gov-coord-v2-tests.yml
 * (`scripts/orchestration-v2/*​/*.test.cjs` glob'u — yeni dosya icin ci.yml
 * duzenlemesi gerekmez).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function repoRoot() {
  return path.join(__dirname, '..', '..', '..', '..');
}

const read = (repoPath) => fs.readFileSync(path.join(repoRoot(), ...repoPath.split('/')), 'utf8');

const CONTRACT = 'project/docs/governance/coordination-v2/governance-orchestration-contract-v2.md';
const PROCESS_RULES = 'project/docs/governance/process-rules.md';

test('contract immutability birimini revision olarak adlandirir', () => {
  const c = read(CONTRACT);
  assert.match(c, /### 2\.1 Task identity · revision · grant · handoff · termination/);
  assert.match(c, /Immutability'nin birimi task DEĞİL \*\*revision\*\*'dır/);
  assert.match(c, /TASK REVISION\s+: revisionId/);
});

test('§2 grant hukmu (taskId, revisionId) eksenine baglanmistir', () => {
  const c = read(CONTRACT);
  assert.match(c, /aynı `\(taskId, revisionId\)` çifti ile yeniden\s+tanımlanan spec'i\s+\*\*authorize ETMEZ\*\*/);
  // Eski tek-eksenli hukum kalmamalidir; kalirsa iki celiskili kural olur.
  assert.doesNotMatch(c, /aynı `taskId` ile yeniden tanımlanan spec/);
});

test('owner\'in on uc revision kurali contract\'ta tam olarak yer alir', () => {
  const c = read(CONTRACT);
  assert.match(c, /### 2\.2 Revision kuralları/);
  const section = c.split('### 2.2 Revision kuralları')[1].split('\n## ')[0];
  for (let n = 1; n <= 13; n += 1) {
    assert.match(section, new RegExp('^\\| ' + n + ' \\| ', 'm'), 'kural ' + n + ' yok');
  }
  assert.match(section, /`TaskRevision` immutable'dır/);
  assert.match(section, /Drift reconciliation PASS olmadan yeni revision `ELIGIBLE` OLMAZ/);
  assert.match(section, /Bounded capability executor değişikliği task handoff DEĞİLDİR/);
  assert.match(section, /Revision mevcut merge authority'yi başka bir PR'a TAŞIMAZ/);
});

test('immutable-authority guvenligi zayiflatilmamistir', () => {
  const c = read(CONTRACT);
  assert.match(c, /Hash mismatch = fail-closed\./);
  assert.match(c, /Orchestrator grant veya authorization \*\*ÜRETEMEZ\*\*/);
  assert.match(c, /hash mismatch hâlâ\s+fail-closed'dır/);
});

test('STRICT_PINNED_BASE base drift\'i revision olarak yonlendirir', () => {
  const c = read(CONTRACT);
  // §13 tablo satiri — duz metinde gecen adlar degil.
  const row = c.split('\n').find((l) => l.startsWith('| `STRICT_PINNED_BASE`'));
  assert.ok(row, 'STRICT_PINNED_BASE tablo satiri yok');
  assert.match(row, /yeni immutable revision\*\* gerektirir/);
  assert.match(row, /yeni `taskId` gerektirmez/);
  assert.match(row, /drift reconciliation PASS olmadan `ELIGIBLE` olmaz/);
  // Termination'a iten eski cumle kalmamalidir.
  assert.doesNotMatch(row, /Yeni base için \*\*yeni\*\* immutable task spec\/grant gerekir/);
});

test('lifecycle tablosuna HANDOFF_REQUIRED veya SUPERSEDED state EKLENMEMISTIR', () => {
  const c = read(CONTRACT);
  const table = c.split('## 3. Task lifecycle')[1].split('### 3.1')[0];
  assert.doesNotMatch(table, /^\| `HANDOFF_REQUIRED`/m);
  assert.doesNotMatch(table, /^\| `SUPERSEDED`/m);
  assert.match(c, /`HANDOFF_REQUIRED` ve `SUPERSEDED` lifecycle state \*\*DEĞİLDİR\*\*/);
  assert.match(c, /Revision-eligible bir supersession \(§2\.2\) task'ı terminal \*\*ETMEZ\*\*/);
});

test('amendment kaydi owner authority ile birlikte tutulur', () => {
  const c = read(CONTRACT);
  assert.match(c, /### 0\.1 AMENDMENT — immutability revision eksenine bağlandı/);
  assert.match(c, /OWNER-PROGRAM-GOV-TASK-REVISION-CONTINUITY-ENFORCEMENT-R01/);
  // §1.2-A gibi: onceki analiz silinmez, gecerli kalir.
  assert.match(c, /korunmuştur/);
});

test('uc katman ayni ayrimda hemfikirdir', () => {
  const agents = read('AGENTS.md');
  const rules = read(PROCESS_RULES);
  const contract = read(CONTRACT);

  assert.match(agents, /`TASK REVISION ≠ TASK TERMINATION ≠ EXECUTOR HANDOFF\.`/);
  assert.match(rules, /## Task Revision Protokolü/);
  assert.match(contract, /Bu ayrım `AGENTS\.md` §7'de ratifiye edilmiştir/);

  // TEK CANONICAL HOME: contract normatif cekirdegi tekrar etmez, isaret eder.
  assert.doesNotMatch(contract, /yeni immutable revision ile devam eder/);
});

test('contract yeni authority modeli uretmedigini soyler', () => {
  const c = read(CONTRACT);
  assert.match(c, /yeni bir authority modeli üretmez/);
  assert.match(c, /IMPLEMENTATION AUTHORITY: NONE/);
});

test('backward-compatible reader davranisi yazilidir', () => {
  const c = read(CONTRACT);
  assert.match(c, /`revisionId = 1`/);
  assert.match(c, /mevcut task ve grant kayıtları geçerliliğini korur/);
});
