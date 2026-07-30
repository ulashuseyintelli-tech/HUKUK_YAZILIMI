/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 /
 * CLOSEOUT-AUTHORITY-CONTRACT-IMPLEMENTATION-R01 — owner OPTION A (REFINED).
 *
 * Bagimlayici hukum: task-specific `IF GO-COMPLETE` canonical ex-ante merge and delivery
 * authority'sidir. Ledger turetilmis kanit / dogfood / reuse-koruma mekanizmasidir ve
 * authority kaynagi DEGILDIR. Owner authority ile tum task gate'leri belirsizlik
 * tasimiyorken ledger veya closeout-runner arizasi BAGIMSIZ bir delivery blocker'i
 * degildir.
 *
 * Bu spec sozlesmenin iki yuzunu de test eder:
 *   1) metin sozlesmesi — `AGENTS.md` ve `pr-closeout.md` icindeki normatif hukumler
 *   2) kod sozlesmesi   — merge actor temsili ve canonical workspaceModule enum'u
 *
 * W3 (`PR #1949`) bu sozlesme yaziya dokulmeden once fazla-dar okunmus, runner
 * `MERGE_AUTHORITY_LEDGER_REQUIRED` uretince delivery gereksiz yere durdurulmustu.
 * Tarihsel sonuc DEGISTIRILMEZ (`OWNER_MERGED` + ledger dogfood FAIL); bu spec ayni
 * yanlis okumanin tekrarini fail-closed hale getirir.
 *
 * CI baglantisi: apps/api/ci-manifests/pure/platform-scripts-shared.txt
 */

/* eslint-disable @typescript-eslint/no-var-requires */
import { readFileSync } from 'fs';
import { join } from 'path';

const closeout = require('../../../../../scripts/orchestration-v2/closeout/closeout.cjs');
const ledger = require('../../../../../scripts/orchestration-v2/closeout/merge-authority-ledger.cjs');

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');
const AGENTS = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8');
const RUNBOOK = readFileSync(
  join(REPO_ROOT, 'project', 'docs', 'runbooks', 'pr-closeout.md'),
  'utf8',
);

/**
 * Normalize: satir sarmasi, blockquote isareti (`> `) ve egik kesme isareti kural
 * metnini bolmesin. Aksi halde spec, sozlesmenin ANLAMINI degil markdown
 * bicimlendirmesini test etmis olur.
 */
const flat = (text: string) => text
  .replace(/^[ 	]*>[ 	]?/gm, '')
  .replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ');
const AGENTS_FLAT = flat(AGENTS);
const RUNBOOK_FLAT = flat(RUNBOOK);

describe('CLOSEOUT AUTHORITY CONTRACT — authority semantigi', () => {
  it('[1] task/PR-bounded GO-COMPLETE canonical merge authority olarak taninir', () => {
    expect(AGENTS_FLAT).toContain('Merge authority (canonical home)');
    expect(AGENTS_FLAT).toContain(
      "Belirli task veya PR'a bagli `GO-COMPLETE` / `IF GO-COMPLETE`",
    );
    // Authority verildikten sonra ikinci owner turu istenmez.
    expect(AGENTS_FLAT).toContain('CI sonrasinda ikinci owner mesaji istenmez');
  });

  it('[2] ledger authority kaynagi olarak KABUL EDILMEZ', () => {
    expect(AGENTS_FLAT).toContain('Ledger authority DEGILDIR');
    expect(RUNBOOK_FLAT).toContain(
      'Ledger türetilmiş kanıttır, authority kaynağı değildir',
    );
  });

  it('[3] precedence sirasi canonical olarak yazilidir ve executor inference authority degildir', () => {
    const order = [
      'Explicit owner task instruction',
      'Task-specific IF GO-COMPLETE',
      'Program lock and exact task scope',
      'Risk-specific safety and delivery gates',
      'Ledger materialization / deterministic closeout runner',
      'Runner defaults',
      'Executor inference',
    ];
    let cursor = -1;
    for (const step of order) {
      const at = RUNBOOK_FLAT.indexOf(step);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(RUNBOOK_FLAT).toContain('hiçbir seviyede authority DEĞİL');
    expect(RUNBOOK_FLAT).toContain("Ledger 1–4'ün üstüne çıkamaz");
  });

  it('[4] executor kendi task’i icin SA/EG uretemez (self-authority yasagi)', () => {
    expect(AGENTS_FLAT).toContain('ajan kendi task');
    expect(AGENTS_FLAT).toContain('`SEMANTIC_AUTHORITY`/`EXECUTION_GRANT` uretemez');
    expect(AGENTS_FLAT).toContain('ajan-yazimi authority merge kaynagi sayilmaz');
    expect(RUNBOOK_FLAT).toContain('oluşturamaz, ratify edemez veya onaylayamaz');
  });
});

describe('CLOSEOUT AUTHORITY CONTRACT — fallback ve blocker sinirlari', () => {
  it('[5] runner exact blocker / desteklenmeyen senaryo / ledger arizasi fallback secer', () => {
    for (const trigger of [
      'Runner kullanilamiyor',
      'senaryoyu desteklemiyor',
      'exact blocker',
      'ledger materialize edilemiyorsa',
    ]) {
      expect(AGENTS_FLAT).toContain(trigger);
    }
    expect(AGENTS_FLAT).toContain('ajan fallback ile kapatir');
  });

  it('[6] fallback yolunda IKINCI OWNER MESAJI istenmez', () => {
    expect(AGENTS_FLAT).toContain('ikinci owner mesaji ISTENMEZ');
    expect(RUNBOOK_FLAT).toContain('ikinci bir owner merge mesajı gerektirmez');
  });

  it('[7] fallback gate atlamaz — ayni gate’ler elle dogrulanir', () => {
    expect(AGENTS_FLAT).toContain("gate'ler elle dogrulanir");
    expect(RUNBOOK_FLAT).toContain('Fallback **gate atlamaz**');
    expect(RUNBOOK_FLAT).toContain("manuel kapanışta da aynı gate'ler elle doğrulanır");
  });

  it('[8] gercek delivery blocker’lari korunur', () => {
    for (const blocker of [
      'owner authority absent',
      'owner authority ambiguous',
      'exact scope mismatch',
      'program lock',
      'competing writer',
      'semantic conflict',
      'merge conflict',
      'required CI failure',
      'PR not CLEAN/MERGEABLE',
      'unauthorized schema or migration',
      'missing production activation authority',
      'failed backup or rollback gate',
      'tenant isolation failure',
      'credential leak',
      'destructive real-data risk',
      'runtime verification failure',
    ]) {
      expect(RUNBOOK_FLAT).toContain(blocker);
    }
  });

  it('[9] ledger/runner arizalari TEK BASINA blocker degildir', () => {
    for (const nonBlocker of [
      'ledger absent',
      'ledger materialization failure',
      'runner unsupported scenario',
      'runner exact technical blocker',
      'workspaceModule runner mismatch',
      'dogfood failure',
    ]) {
      expect(RUNBOOK_FLAT).toContain(nonBlocker);
    }
    expect(RUNBOOK_FLAT).toContain(
      "deterministic fallback + governance residual üretir; delivery'yi durdurmaz",
    );
  });
});

describe('CLOSEOUT AUTHORITY CONTRACT — MERGED vs DELIVERED', () => {
  it('[10] MERGED yalniz governance-only gorevde terminaldir', () => {
    expect(AGENTS_FLAT).toContain('`MERGED` yalniz governance-only gorevde terminaldir');
    expect(AGENTS_FLAT).toContain(
      "runtime-affecting gorev post-merge acceptance gate'leri olmadan CLOSED sayilmaz",
    );
  });

  it('[11] gorev sinifi bazli acceptance zincirleri runbook’ta tanimlidir', () => {
    for (const cls of [
      'governance-only',
      'tooling / runner',
      'runtime code',
      'migration',
      'security patch',
      'feature flag',
      'scheduler / queue',
    ]) {
      expect(RUNBOOK_FLAT).toContain(cls);
    }
    expect(RUNBOOK_FLAT).toContain('RUNTIME_VERIFIED');
    expect(RUNBOOK_FLAT).toContain('BACKUP_VERIFIED');
    expect(RUNBOOK_FLAT).toContain('STARTUP REGISTRATION');
  });

  it('[12] delivery ve dogfood ayri raporlanir; PASS+FAIL birlikte gecerlidir', () => {
    for (const field of [
      'DELIVERY',
      'RUNTIME ACCEPTANCE',
      'LEDGER DOGFOOD',
      'CLOSEOUT MECHANISM',
      'FINAL TASK STATUS',
    ]) {
      expect(RUNBOOK_FLAT).toContain(field);
    }
    expect(RUNBOOK_FLAT).toContain(
      'DELIVERY: PASS · LEDGER DOGFOOD: FAIL · CLOSEOUT MECHANISM: EXECUTOR_FALLBACK',
    );
  });
});

describe('CLOSEOUT AUTHORITY CONTRACT — merge actor temsili (kod)', () => {
  it('[13] dort merge actor’u tanimlidir', () => {
    expect(closeout.MERGE_ACTORS).toEqual([
      'LIVE_RUNNER',
      'EXECUTOR_FALLBACK',
      'OWNER',
      'NONE',
    ]);
  });

  it('[14] owner merge ile executor fallback merge AYNI state DEGILDIR', () => {
    expect(closeout.deliveryFor('OWNER')).toBe('OWNER_MERGED');
    expect(closeout.deliveryFor('EXECUTOR_FALLBACK')).toBe('EXECUTOR_FALLBACK_MERGED');
    expect(closeout.deliveryFor('OWNER')).not.toBe(closeout.deliveryFor('EXECUTOR_FALLBACK'));
    expect(closeout.deliveryFor('LIVE_RUNNER')).toBe('RUNNER_MERGED');
    expect(closeout.deliveryFor('NONE')).toBe('NOT_MERGED');
  });

  it('[15] bilinmeyen actor fail-closed reddedilir (negatif)', () => {
    expect(() => closeout.deliveryFor('SOMEONE_ELSE')).toThrow('UNKNOWN_MERGE_ACTOR');
    expect(() => closeout.deliveryFor(undefined)).toThrow('UNKNOWN_MERGE_ACTOR');
  });

  it('[16] terminal delivery esleme tablosu eksiksizdir', () => {
    for (const actor of closeout.MERGE_ACTORS) {
      expect(typeof closeout.TERMINAL_DELIVERY_BY_ACTOR[actor]).toBe('string');
    }
    expect(Object.keys(closeout.TERMINAL_DELIVERY_BY_ACTOR).sort()).toEqual(
      [...closeout.MERGE_ACTORS].sort(),
    );
  });
});

describe('CLOSEOUT AUTHORITY CONTRACT — workspaceModule', () => {
  it('[17] canonical enum sekiz degerden olusur', () => {
    expect([...ledger.CANONICAL_WORKSPACE_MODULES].sort()).toEqual([
      'CLIENT',
      'COLLECTION',
      'CROSS_MODULE',
      'DEBTOR',
      'OFFICE',
      'RECEIVABLE',
      'SHARED_CONTROL_PLANE',
      'UNKNOWN',
    ]);
  });

  it('[18] REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE GECERSIZDIR (negatif)', () => {
    expect(ledger.CANONICAL_WORKSPACE_MODULES.has('REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE'))
      .toBe(false);
    expect(RUNBOOK_FLAT).toContain(
      '`REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE` **workspaceModule olarak GEÇERSİZDİR.**',
    );
  });

  it('[19] modul-kapsamli degerler artik kabul edilir (hard-code kaldirildi)', () => {
    for (const mod of ['OFFICE', 'CLIENT', 'DEBTOR', 'RECEIVABLE', 'COLLECTION']) {
      expect(ledger.CANONICAL_WORKSPACE_MODULES.has(mod)).toBe(true);
    }
    // Sabit deger artik kaynak metninde tek dogru cevap olarak yazili degildir.
    const source = readFileSync(
      join(
        REPO_ROOT,
        'project/scripts/orchestration-v2/closeout/merge-authority-ledger.cjs',
      ),
      'utf8',
    );
    expect(source).not.toContain("workspaceModule: 'SHARED_CONTROL_PLANE'");
    expect(source).toContain('AUTHORITY_WORKSPACE_MODULE_INVALID');
  });

  it('[20] deger task/authority kaydindan alinir ve enum’a dogrulanir', () => {
    expect(RUNBOOK_FLAT).toContain(
      "Değer sabit hard-code edilmez; task/authority kaydından alınır ve canonical enum'a doğrulanır",
    );
  });
});

describe('CLOSEOUT AUTHORITY CONTRACT — W3 retrospektifi', () => {
  it('[21] W3 sonucu tarihsel olarak korunur ve duzeltme kayitlidir', () => {
    const w3 = readFileSync(
      join(
        REPO_ROOT,
        'project/docs/governance/runtime-operability-certification-r01',
        'w3-async-event-queue-scheduler/post-merge-certification.md',
      ),
      'utf8',
    );
    const w3flat = flat(w3);
    // Tarihsel gercek degistirilmedi.
    expect(w3flat).toContain('OWNER_MERGED');
    expect(w3flat).toContain('DOGFOOD_FAILED');
    // Retrospektif duzeltme acikca yazili.
    expect(w3flat).toContain('deterministic fallback');
    expect(w3flat).toContain('Delivery durdurulmamaliydi');
  });
});
