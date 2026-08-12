#!/usr/bin/env node
// PR-2A1 — MANIFEST DOGRULAYICI + RAPOR URETICI.
//
// Tek makine-okunur kaynak: `silent-mutation-manifest.json`.
// Markdown raporu BURADAN URETILIR; elle duzenlenmez ve kanit sayilmaz.
//
// Ihlalde non-zero cikar:
//   - duplicate stable key
//   - bilinmeyen/eksik alan (unclassified)
//   - aritmetik esitsizlik: fixed + tested_false_positive + unresolved != baseline
//   - `--terminal` verilmisse: unresolved != 0
//
// Kullanim:
//   node scripts/silent-mutation-manifest.mjs            # dogrula + rapor uret
//   node scripts/silent-mutation-manifest.mjs --terminal # A1 kapanis kapisi

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, 'silent-mutation-manifest.json');
const REPORT = path.join(HERE, 'silent-mutation-inventory.md');

const TERMINAL = {
  FALSE_SUCCESS: new Set(['FIXED', 'BEST_EFFORT_OBSERVABLE', 'TESTED_FALSE_POSITIVE']),
  DEMO_FALLBACK: new Set(['REMOVED', 'DEPENDENCY_FIXED', 'DEV_TEST_ONLY_TESTED']),
};

const errors = [];
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// 1) duplicate stable key
const seen = new Map();
for (const n of m.nodes) {
  if (seen.has(n.key)) errors.push(`duplicate stable key: ${n.key}`);
  seen.set(n.key, n);
}

// 2) unclassified / eksik alan
for (const n of m.nodes) {
  if (!n.key || !n.axis || !n.slice || !n.status) {
    errors.push(`unclassified node: ${JSON.stringify(n)}`);
    continue;
  }
  if (!TERMINAL[n.axis]) errors.push(`bilinmeyen eksen: ${n.axis} (${n.key})`);
  else if (n.status !== 'OPEN' && !TERMINAL[n.axis].has(n.status)) {
    errors.push(`bilinmeyen durum: ${n.status} (${n.key})`);
  }
}

// 3) eksen bazli aritmetik
const stats = {};
for (const [axis, cfg] of Object.entries(m.axes)) {
  const nodes = m.nodes.filter((n) => n.axis === axis);
  const resolved = nodes.filter((n) => n.status !== 'OPEN');
  const fixed = nodes.filter((n) => n.status === 'FIXED' || n.status === 'REMOVED').length;
  const dependencyFixed = nodes.filter((n) => n.status === 'DEPENDENCY_FIXED').length;
  const testedFp = nodes.filter((n) => n.status === 'TESTED_FALSE_POSITIVE').length;
  const tracked = nodes.length;
  const unresolved = cfg.baseline - resolved.length;
  stats[axis] = { baseline: cfg.baseline, tracked, fixed, dependencyFixed, testedFp, unresolved };

  if (axis === 'FALSE_SUCCESS') {
    // DEPENDENCY_FIXED read node'lari bu eksende YOKTUR; toplam tam esitlik vermeli.
    if (tracked !== cfg.baseline) {
      errors.push(`FALSE_SUCCESS izlenen dugum ${tracked} != baseline ${cfg.baseline}`);
    }
    if (fixed + testedFp + unresolved !== cfg.baseline) {
      errors.push(
        `aritmetik esitsizlik: ${fixed} + ${testedFp} + ${unresolved} != ${cfg.baseline}`,
      );
    }
  }
}

// ── 3b) SCANNER RECONCILIATION ──────────────────────────────────────────────────────
//
// JSON KAYIT kaynagidir; GERCEKLIK kaynagi kodun fresh AST taramasidir. Elle `FIXED`
// yazilmasi aritmetigi gecirir ama kodu duzeltmez — bu yuzden her beyan taramaya karsi
// uzlastirilir.
function freshScannerKeys() {
  // CIKIS SOZLESMESI — kesin ve dar:
  //   exit 0        -> tarama tamamlandi, ihlal YOK
  //   exit 1        -> tarama tamamlandi, ihlal VAR; stdout parse edilir
  //   >1 / null     -> SCANNER_EXECUTION_FAILED (crash, signal, spawn hatasi, timeout)
  // Crash'i "ihlal bulundu" sanmak, bu programin kapatmaya calistigi hata sinifidir.
  const r = spawnSync(process.execPath, [path.join(HERE, 'silent-mutation-scan.mjs')], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180000,
  });

  if (r.error) throw new Error(`SCANNER_EXECUTION_FAILED: spawn hatasi — ${r.error.message}`);
  if (r.signal) throw new Error(`SCANNER_EXECUTION_FAILED: sinyal ile sonlandi — ${r.signal}`);
  if (r.status === null) throw new Error('SCANNER_EXECUTION_FAILED: timeout (terminal kanit SAYILMAZ)');
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(`SCANNER_EXECUTION_FAILED: beklenmeyen exit ${r.status}`);
  }

  const stdout = String(r.stdout ?? '');
  if (!stdout.trim()) throw new Error('SCANNER_EXECUTION_FAILED: stdout BOS');

  const stderr = String(r.stderr ?? '');
  if (/(Error|Cannot find|MODULE_NOT_FOUND|SyntaxError|TypeError)/.test(stderr)) {
    throw new Error(`SCANNER_EXECUTION_FAILED: stderr operasyonel hata iceriyor — ${stderr.trim().slice(0, 200)}`);
  }

  const lines = stdout.split(String.fromCharCode(10)).map((l) => l.replace(String.fromCharCode(13), ''));

  // Scanner'in kendi bildirdigi toplam ile parse edilen dugum sayisi ESLESMELI.
  const totalLine = lines.find((l) => /sessiz bulgu/.test(l));
  if (!totalLine) throw new Error('SCANNER_EXECUTION_FAILED: beklenen ozet satiri YOK (schema uyusmazligi)');
  const reported = Number((totalLine.match(/(\d+)\s*$/) ?? [])[1]);
  if (!Number.isFinite(reported)) {
    throw new Error('SCANNER_EXECUTION_FAILED: ozet satiri sayiya cozulemedi');
  }
  if (r.status === 0 && reported !== 0) {
    throw new Error(`SCANNER_EXECUTION_FAILED: exit 0 fakat ${reported} ihlal bildirildi`);
  }

  // A1 manifesti YALNIZ yalanci-basari eksenini izler. Tarayici P3 (yalniz-yutma)
  // dugumlerini de basar; onlar PR-2B'nin kapsamidir ve burada "manifestte yok"
  // sayilmaz. Toplam mutabakati TUM ihlaller uzerinden, key eslemesi YALNIZ
  // yalanci-basari alt kumesi uzerinden yapilir.
  const counts = new Map();
  let parsed = 0;
  let falseSuccess = 0;
  for (const line of lines) {
    const mm = line.match(/^\s+SM\d+\s+(\S+):(\d+)\s+(\S+)\s/);
    if (!mm) continue;
    parsed += 1;
    if (!/YALANCI BASARI/.test(line)) continue;
    falseSuccess += 1;
    const key = `${mm[1]}#${mm[3]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  counts.__falseSuccessTotal = falseSuccess;
  if (parsed !== reported) {
    throw new Error(`SCANNER_EXECUTION_FAILED: parse edilen ${parsed} != bildirilen ${reported}`);
  }
  return counts;
}

/** `file#fn:suffix` -> `file#fn` (ayni fonksiyonda birden fazla ihlal icin ayirici). */
const baseKey = (k) => k.replace(/:[^:#]+$/, '');

let scanned = null;
try {
  scanned = freshScannerKeys();
} catch (e) {
  // Tarama calismadiysa HICBIR reconciliation sonucu uretilmez — "bulunamadi" ile
  // "tarama yapilamadi" ayni sey DEGILDIR. Terminal kanit da sayilmaz.
  errors.push(String((e && e.message) || e));
}

const manifestCounts = new Map();
for (const n of m.nodes) {
  if (n.axis !== 'FALSE_SUCCESS') continue;
  const k = baseKey(n.key);
  manifestCounts.set(k, (manifestCounts.get(k) ?? 0) + 1);
}

for (const n of scanned ? m.nodes : []) {
  if (n.axis !== 'FALSE_SUCCESS') continue;
  const k = baseKey(n.key);
  const inScan = (scanned.get(k) ?? 0) > 0;

  if (n.status === 'FIXED' && inScan) {
    errors.push(`FIXED beyani taramayla celisiyor (hala ihlal): ${n.key}`);
  }
  if (n.status === 'OPEN' && !inScan) {
    if (!n.supersededBy) {
      errors.push(`stale manifest: UNRESOLVED key fresh kodda YOK ve supersededBy kaydi yok: ${n.key}`);
    }
  }
  if (n.status === 'TESTED_FALSE_POSITIVE') {
    if (!n.evidenceTest) {
      errors.push(`TESTED_FALSE_POSITIVE icin evidenceTest zorunlu: ${n.key}`);
    } else if (!fs.existsSync(path.resolve(HERE, '..', n.evidenceTest))) {
      errors.push(`evidenceTest dosyasi bulunamadi: ${n.evidenceTest} (${n.key})`);
    }
  }
}

// Taramada olup manifestte olmayan key -> yeni/kacmis ihlal
for (const [k, count] of scanned ?? []) {
  const declared = manifestCounts.get(k) ?? 0;
  if (declared === 0) {
    errors.push(`taramada var, manifestte YOK: ${k}`);
  } else if (count > declared) {
    errors.push(`signature kacisi: ${k} taramada ${count}, manifestte ${declared} (supersededBy/migration kaydi gerekli)`);
  }
}

const terminalGate = process.argv.includes('--terminal');
// --terminal YALNIZ aritmetik + scanner reconciliation + test evidence birlikte gecerse 0 doner.
if (terminalGate && stats.FALSE_SUCCESS.unresolved !== 0) {
  errors.push(`terminal kapi: FALSE_SUCCESS unresolved=${stats.FALSE_SUCCESS.unresolved} (0 olmali)`);
}

// 4) raporu URET (elle yazilmaz)
const row = (n) => `| \`${n.key}\` | ${n.axis} | ${n.status}${n.note ? ` — ${n.note}` : ''} |`;
const p = m.provenance;
const md = `<!-- URETILMIS DOSYA — ELLE DUZENLEMEYIN.
     Kaynak: silent-mutation-manifest.json
     Uretim: node scripts/silent-mutation-manifest.mjs -->

# ${m.program} — ${m.slice} signature envanteri

## Provenance

| Olcum | Ref | Aciklama |
|---|---|---|
| BASE_SCAN | \`${p.BASE_SCAN.ref}\` | ${p.BASE_SCAN.note} |
| CURRENT_SCAN | \`${p.CURRENT_SCAN.ref}\` | ${p.CURRENT_SCAN.note} |
| FINAL_SCAN | \`${p.FINAL_SCAN.ref ?? 'PENDING'}\` | ${p.FINAL_SCAN.note} |

BASE_SCAN sayimlari: false-success ${p.BASE_SCAN.falseSuccess} · demo-fallback ${p.BASE_SCAN.demoFallback} · AST ${p.BASE_SCAN.astViolations}.
Fark yalniz bu iki olcum arasindaki diff'ten turetilir; main'deki baska degisiklikler A1 basarisi SAYILMAZ.

## Sayimlar

\`\`\`text
FALSE_SUCCESS: ${stats.FALSE_SUCCESS.baseline} = ${stats.FALSE_SUCCESS.fixed} FIXED + ${stats.FALSE_SUCCESS.testedFp} TESTED_FP + ${stats.FALSE_SUCCESS.unresolved} UNRESOLVED
DEMO_FALLBACK: baseline ${stats.DEMO_FALLBACK.baseline} / removed ${stats.DEMO_FALLBACK.fixed} / dependency-fixed ${stats.DEMO_FALLBACK.dependencyFixed} / unresolved ${stats.DEMO_FALLBACK.unresolved}
\`\`\`

DEPENDENCY_FIXED read node'lari FALSE_SUCCESS hesabina GIRMEZ.
Ayni delete node iki eksende gorunuyorsa cross-reference edilir, iki kez SAYILMAZ.

## Dugumler

| Stable key | Envanter | Durum |
|---|---|---|
${m.nodes.map(row).join('\n')}
`;
fs.writeFileSync(REPORT, md, 'utf8');

if (errors.length) {
  console.error('MANIFEST IHLALLERI:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(
  `manifest OK — FALSE_SUCCESS ${stats.FALSE_SUCCESS.baseline} = ${stats.FALSE_SUCCESS.fixed} FIXED + ${stats.FALSE_SUCCESS.testedFp} TESTED_FP + ${stats.FALSE_SUCCESS.unresolved} UNRESOLVED`,
);
console.log(`rapor uretildi: ${path.basename(REPORT)}`);
