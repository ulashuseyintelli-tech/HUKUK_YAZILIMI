/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3 — ASYNC RUNTIME BINDING GUARD.
 *
 * NEDEN: Bir `@Cron` tasiyan servis, providers'a kayitli oldugu modul AppModule
 * import kapanisindan DUSERSE hicbir derleme/tip hatasi olusmaz — cron sessizce
 * calismayi birakir. W3 sertifikasyonu bu zinciri RUNTIME'da olcmustur
 * (SchedulerRegistry: 33 kayitli cron job, 16 kayitli outbox handler). Bu guard
 * ayni sayilari STATIK olarak sabitler; sessiz kopma CI'da kirmizi olur.
 *
 * KAPSAM SINIRI: Bu guard hicbir sey AKTIVE ETMEZ ve dormant durumu DEGISTIRMEZ.
 * `IcrabotModule` bilincli olarak AppModule'e import EDILMEMISTIR (app.module.ts
 * icindeki "Prisma client regenerate sonrasi aktif et" notu); guard bu dormant
 * durumu kayit altina alir, kaldirmaz.
 *
 * Yalniz kaynak metni okur: DB, ag ve Nest bootstrap YOK.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, dirname, normalize, sep } from 'path';

const SRC = join(__dirname, '..', '..');
const APP_MODULE = join(SRC, 'app.module.ts');

// ── W3 SERTIFIKALI ENVANTER (runtime SchedulerRegistry ile birebir dogrulandi) ──
/** AppModule kapanisinda BAGLI olan, @Cron tasiyan sinif -> bildirim sayisi. */
const CERTIFIED_BOUND_CRON: ReadonlyArray<readonly [string, number]> = [
  ['AddressTaskSchedulerService', 3],
  ['AutomationService', 8],
  ['CaseTaskEscalationService', 1],
  ['DecisionLogRetentionService', 1],
  ['DeprecatedUsageTrackerService', 3],
  ['ErrorLogRetentionService', 1],
  ['ExchangeRateService', 1],
  ['GazetteWatcherService', 1],
  ['GreetingService', 1],
  ['OfficeApprovalExecutorCronService', 1],
  ['OperationalEscalationService', 1],
  ['OutboxCronService', 1],
  ['RateSyncService', 2],
  ['SchedulerService', 8],
];
const CERTIFIED_BOUND_CRON_JOB_COUNT = 33;

/** Bilincli DORMANT: modulu (IcrabotModule) AppModule'e import EDILMEZ. */
const CERTIFIED_DORMANT_CRON_FILES: readonly string[] = [
  'modules/icrabot/scheduler/scheduler.service.ts',
  'modules/icrabot/task-orchestrator.service.ts',
];

/** Outbox tuketimini gercekten baglayan domain registrar'lari (OnModuleInit). */
const CERTIFIED_BOUND_REGISTRARS: readonly string[] = [
  'PaymentReceivedRegistrar',
  'PaymentReversedRegistrar',
  'ServiceOccurrenceRecordedRegistrar',
];

// ── kaynak tarama yardimcilari ───────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(SRC, p).split(sep).join('/');
const isTest = (p: string) => /__tests__|\.spec\.ts$|\.test\.ts$/.test(p);

/** Yorumlari bosluga cevirir: yorumlanmis import/@Cron ASLA sayilmaz. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (src[i] === '/' && src[i + 1] === '*') {
      out += '  '; i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += '  '; i += 2;
    } else { out += src[i]; i++; }
  }
  return out;
}
function sliceBalanced(txt: string, start: number, open: string, close: string): string {
  let d = 0;
  for (let i = start; i < txt.length; i++) {
    if (txt[i] === open) d++;
    else if (txt[i] === close) { d--; if (d === 0) return txt.slice(start, i + 1); }
  }
  return '';
}

const FILES = walk(SRC).filter((f) => !isTest(f));
const CLEAN = new Map<string, string>();
for (const f of FILES) CLEAN.set(rel(f), stripComments(readFileSync(f, 'utf8')));

/** Sinif adi -> onu tanimlayan dosyalar (tekil eslesme fallback'i icin). */
const DECLARED = new Map<string, string[]>();
for (const [file, src] of CLEAN) {
  const re = /export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!DECLARED.has(m[1])) DECLARED.set(m[1], []);
    DECLARED.get(m[1])!.push(file);
  }
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const t = normalize(join(dirname(fromFile), spec)).split(sep).join('/');
  for (const c of [`${t}.ts`, `${t}/index.ts`]) if (CLEAN.has(c)) return c;
  return null;
}
/** barrel (index.ts) re-export zincirini izleyerek gercek tanim dosyasini bulur. */
function followBarrel(file: string | null, name: string, depth = 0): string | null {
  if (!file || depth > 6) return null;
  const src = CLEAN.get(file);
  if (!src) return null;
  if (new RegExp(`export\\s+(?:abstract\\s+)?class\\s+${name}\\b`).test(src)) return file;
  let m: RegExpExecArray | null;
  const named = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = named.exec(src)) !== null) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
    if (names.includes(name)) {
      const r = followBarrel(resolveSpec(file, m[2]), name, depth + 1);
      if (r) return r;
    }
  }
  const star = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = star.exec(src)) !== null) {
    const r = followBarrel(resolveSpec(file, m[1]), name, depth + 1);
    if (r) return r;
  }
  return null;
}
function importMap(file: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  const src = CLEAN.get(file)!;
  while ((m = re.exec(src)) !== null) {
    const target = resolveSpec(file, m[2]);
    if (!target) continue;
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) map.set(n, target);
    }
  }
  return map;
}
function resolveId(name: string, imap: Map<string, string>): string {
  const target = imap.get(name);
  if (target) {
    const real = followBarrel(target, name);
    if (real) return `${real}#${name}`;
  }
  const cands = DECLARED.get(name);
  if (cands && cands.length === 1) return `${cands[0]}#${name}`;
  return `EXTERNAL#${name}`;
}
function topLevelEntries(body: string, key: string): string[] {
  const m = new RegExp(`(^|[^A-Za-z0-9_])${key}\\s*:\\s*\\[`).exec(body);
  if (!m) return [];
  const arr = sliceBalanced(body, m.index + m[0].length - 1, '[', ']');
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of arr.slice(1, -1)) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const names: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p || p.startsWith('...')) continue;
    if (p.startsWith('{')) {
      const uc = /use(?:Class|Existing)\s*:\s*([A-Za-z0-9_]+)/.exec(p);
      if (uc) names.push(uc[1]);
      continue;
    }
    const g = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(p);
    if (g) names.push(g[1]);
  }
  return names;
}

type ModuleRec = { file: string; imports: string[]; providers: string[] };
const MODULES = new Map<string, ModuleRec>();
for (const [file, src] of CLEAN) {
  const imap = importMap(file);
  let idx = 0;
  for (;;) {
    const at = src.indexOf('@Module(', idx);
    if (at === -1) break;
    const body = sliceBalanced(src, at + '@Module'.length, '(', ')');
    const cm = /export\s+class\s+([A-Za-z0-9_]+)/.exec(src.slice(at + body.length));
    if (cm) {
      MODULES.set(`${file}#${cm[1]}`, {
        file,
        imports: topLevelEntries(body, 'imports').map((n) => resolveId(n, imap)),
        providers: [...topLevelEntries(body, 'providers'), ...topLevelEntries(body, 'controllers')]
          .map((n) => resolveId(n, imap)),
      });
    }
    idx = at + body.length + 1;
  }
}

/** AppModule import kapanisi (kosullu spread import'lar dahil edilmez). */
const CLOSURE = new Set<string>();
{
  const queue = [`${rel(APP_MODULE)}#AppModule`];
  while (queue.length) {
    const cur = queue.shift()!;
    if (CLOSURE.has(cur)) continue;
    CLOSURE.add(cur);
    const m = MODULES.get(cur);
    if (!m) continue;
    for (const id of m.imports) if (!CLOSURE.has(id)) queue.push(id);
  }
}
const boundOwners = (classId: string) =>
  [...MODULES.entries()].filter(([id, m]) => CLOSURE.has(id) && m.providers.includes(classId)).map(([id]) => id);

/** @Cron tasiyan her (dosya, sinif) ve bildirim sayisi. */
const CRON_CARRIERS: Array<{ file: string; cls: string; count: number }> = [];
for (const [file, src] of CLEAN) {
  const count = (src.match(/@Cron\s*\(/g) || []).length;
  if (!count) continue;
  const re = /export\s+class\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) CRON_CARRIERS.push({ file, cls: m[1], count });
}

/**
 * W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01: her @Cron cagrisinin TAM arguman
 * metnini (dosya bazinda) cikarir — timeZone kapsamini per-call dogrulamak icin.
 * Yorum icindeki "@Cron" mentionlari CLEAN'de zaten bosluga cevrilmis oldugundan
 * buraya girmez.
 */
const CRON_CALL_ARGS = new Map<string, string[]>();
for (const [file, src] of CLEAN) {
  const calls: string[] = [];
  let idx = 0;
  for (;;) {
    const at = src.indexOf('@Cron', idx);
    if (at === -1) break;
    let p = at + 5;
    while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] !== '(') { idx = at + 5; continue; }
    const argsText = sliceBalanced(src, p, '(', ')');
    if (argsText) calls.push(argsText);
    idx = p + Math.max(argsText.length, 1);
  }
  if (calls.length) CRON_CALL_ARGS.set(file, calls);
}
const isBoundCarrier = (c: { file: string; cls: string }) => boundOwners(`${c.file}#${c.cls}`).length > 0;

describe('W3 — async runtime binding guard (AppModule kapanisi)', () => {
  it('[1] AppModule kapanisi cozulebilir ve bos degildir', () => {
    expect(CLOSURE.size).toBeGreaterThan(50);
    expect(MODULES.has(`${rel(APP_MODULE)}#AppModule`)).toBe(true);
  });

  it('[2] sertifikali BAGLI cron servisleri hala AppModule kapanisinda', () => {
    const missing: string[] = [];
    for (const [cls] of CERTIFIED_BOUND_CRON) {
      const carriers = CRON_CARRIERS.filter((c) => c.cls === cls);
      const anyBound = carriers.some((c) => boundOwners(`${c.file}#${c.cls}`).length > 0);
      if (!anyBound) missing.push(cls);
    }
    expect(missing).toEqual([]);
  });

  it('[3] BAGLI @Cron bildirim sayisi sertifikali degeri korur', () => {
    let total = 0;
    for (const c of CRON_CARRIERS) {
      if (boundOwners(`${c.file}#${c.cls}`).length > 0) total += c.count;
    }
    expect(total).toBe(CERTIFIED_BOUND_CRON_JOB_COUNT);
  });

  it('[4] DORMANT icrabot cron servisleri AKTIVE EDILMEMIS olarak kalir', () => {
    for (const file of CERTIFIED_DORMANT_CRON_FILES) {
      const carriers = CRON_CARRIERS.filter((c) => c.file === file);
      expect(carriers.length).toBeGreaterThan(0);
      for (const c of carriers) {
        expect(boundOwners(`${c.file}#${c.cls}`)).toEqual([]);
      }
    }
    const icrabotBound = [...CLOSURE].some((id) => id.endsWith('#IcrabotModule'));
    expect(icrabotBound).toBe(false);
  });

  it('[5] outbox domain registrar’lari BAGLI kalir (handler kaydi kopmaz)', () => {
    for (const cls of CERTIFIED_BOUND_REGISTRARS) {
      const files = DECLARED.get(cls) ?? [];
      expect(files.length).toBe(1);
      expect(boundOwners(`${files[0]}#${cls}`).length).toBeGreaterThan(0);
    }
  });

  it('[6] envantere girmemis YENI bir bagli cron servisi sessizce eklenemez', () => {
    const known = new Set(CERTIFIED_BOUND_CRON.map(([c]) => c));
    const unexpected = CRON_CARRIERS
      .filter((c) => boundOwners(`${c.file}#${c.cls}`).length > 0 && !known.has(c.cls))
      .map((c) => `${c.file}#${c.cls}`);
    expect(unexpected).toEqual([]);
  });

  // ── W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01 ────────────────────────────
  it('[7] BAGLI her @Cron cagrisi canonical SCHEDULER_TIMEZONE tasir (environment-default YOK)', () => {
    const violations: string[] = [];
    for (const c of CRON_CARRIERS) {
      if (!isBoundCarrier(c)) continue; // dormant (icrabot) bu kontrolun disinda — W3-F06 kapsami
      const calls = CRON_CALL_ARGS.get(c.file) ?? [];
      for (const args of calls) {
        if (!/timeZone\s*:\s*SCHEDULER_TIMEZONE\b/.test(args)) {
          violations.push(`${c.file}#${c.cls}: ${args.replace(/\s+/g, ' ').slice(0, 100)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('[8] BAGLI hicbir @Cron cagrisi ham/farkli bir timezone string literali tasimaz (tek merkezi kaynak)', () => {
    const violations: string[] = [];
    for (const c of CRON_CARRIERS) {
      if (!isBoundCarrier(c)) continue;
      const calls = CRON_CALL_ARGS.get(c.file) ?? [];
      for (const args of calls) {
        const m = /timeZone\s*:\s*(['"])(.*?)\1/.exec(args);
        if (m) violations.push(`${c.file}#${c.cls}: literal timeZone='${m[2]}' (SCHEDULER_TIMEZONE yerine)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('[9] SCHEDULER_TIMEZONE kullanan her dosya onu canonical common modulunden import eder', () => {
    const missing: string[] = [];
    for (const [file, calls] of CRON_CALL_ARGS) {
      const usesConstant = calls.some((a) => /timeZone\s*:\s*SCHEDULER_TIMEZONE\b/.test(a));
      if (!usesConstant) continue;
      const src = CLEAN.get(file)!;
      if (!/from\s*['"][^'"]*common\/scheduler-timezone['"]/.test(src)) missing.push(file);
    }
    expect(missing).toEqual([]);
  });

  it('[10] DORMANT icrabot cron cagrilari timeZone kontrolunden istisna tutulur (W3-F06 kapsam disi)', () => {
    for (const file of CERTIFIED_DORMANT_CRON_FILES) {
      const calls = CRON_CALL_ARGS.get(file) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      // Bu test hicbir sey ASSERT ETMEZ, yalniz istisnayi kayit altina alir — [7]/[8]
      // zaten isBoundCarrier ile bunlari atlar; bu, o atlamanin BILINCLI oldugunu belgeler.
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `from` konumundan itibaren metot govdesinin ACILIS `{` pozisyonunu bulur.
 * Donus tipindeki ic ice `<...>` (orn. `Promise<{ a: number }>`) GUVENLE
 * atlanir — saf `[^{]+` regex'inin aksine, `<`/`>` derinligini sayarak tarar,
 * boylece donus tipi icindeki bir nesne-literal `{` govde acilisi SANILMAZ.
 * Govdesiz imza (abstract/overload, `;` ile biter) icin null doner.
 */
function scanToBodyBrace(src: string, from: number): number | null {
  let i = from;
  let angleDepth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '<') angleDepth++;
    else if (ch === '>') { if (angleDepth > 0) angleDepth--; }
    else if (ch === '{' && angleDepth === 0) return i;
    else if (ch === ';' && angleDepth === 0) return null;
    i++;
  }
  return null;
}
/**
 * Her @Cron cagrisini hemen izleyen metodun DENGELI govdesini cikarir. Basit,
 * tek-metod-govdesi seviyesinde calisir (nested arrow/callback govdeleri DAHIL —
 * balanced-brace slice ic ice olani da kapsar, sadece disaridan disariya kadar).
 */
type CronMethod = { file: string; cls: string; method: string; body: string };
const CRON_METHODS: CronMethod[] = [];
for (const [file, src] of CLEAN) {
  const classPositions: Array<{ name: string; start: number }> = [];
  {
    const re = /export\s+class\s+([A-Za-z0-9_]+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(src)) !== null) classPositions.push({ name: cm[1], start: cm.index });
  }
  const clsAt = (pos: number): string => {
    let name = 'UNKNOWN';
    for (const cp of classPositions) { if (cp.start <= pos) name = cp.name; else break; }
    return name;
  };
  let idx = 0;
  for (;;) {
    const at = src.indexOf('@Cron', idx);
    if (at === -1) break;
    let p = at + 5;
    while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] !== '(') { idx = at + 5; continue; }
    const argsText = sliceBalanced(src, p, '(', ')');
    const afterArgs = p + Math.max(argsText.length, 1);
    const window = src.slice(afterArgs, afterArgs + 400);
    const sig = /\basync\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(window);
    if (sig) {
      const paramsOpen = afterArgs + sig.index + sig[0].length - 1;
      const params = sliceBalanced(src, paramsOpen, '(', ')');
      const braceStart = params ? scanToBodyBrace(src, paramsOpen + params.length) : null;
      const body = braceStart !== null ? sliceBalanced(src, braceStart, '{', '}') : '';
      if (body) CRON_METHODS.push({ file, cls: clsAt(at), method: sig[1], body });
    }
    idx = afterArgs;
  }
}
/** Ayni dosyada, isimle bir private/public metodun DENGELI govdesini bulur (tek-seviye delege takibi icin). */
function methodBodyByName(file: string, name: string): string | null {
  const src = CLEAN.get(file);
  if (!src) return null;
  const re = new RegExp(`\\basync\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  const paramsOpen = m.index + m[0].length - 1;
  const params = sliceBalanced(src, paramsOpen, '(', ')');
  if (!params) return null;
  const braceStart = scanToBodyBrace(src, paramsOpen + params.length);
  if (braceStart === null) return null;
  return sliceBalanced(src, braceStart, '{', '}') || null;
}
/**
 * Bir @Cron metodunun govdesi TEK bir `this.X(...)` cagrisindan ibaretse (orn.
 * errorLogRetention.handleCron -> runRetentionCleanup), gercek mantik/hata-raporlama
 * o delege metodun icindedir — onun govdesini de dahil eder (tek seviye, ayni dosya).
 */
function effectiveBody(cm: CronMethod): string {
  const inner = cm.body.slice(1, -1).trim();
  const delegate = /^(?:await\s+)?(?:return\s+)?this\.([A-Za-z_$][A-Za-z0-9_$]*)\([^)]*\)\s*;?$/.exec(inner);
  if (!delegate) return cm.body;
  const delegateBody = methodBodyByName(cm.file, delegate[1]);
  return delegateBody ? cm.body + '\n' + delegateBody : cm.body;
}
const CERTIFIED_REPORT_CALL = /reportCronJobFailure\s*\(|\breportCronError\s*\(|errorReporter\.report\s*\(/;

describe('W3-F04 — cron terminal-failure-visibility guard (govde seviyesi)', () => {
  it('[11] @Cron metod-govdesi cikarimi sertifikali envanterle tutarlidir (sessiz cikarim kaybi olmaz)', () => {
    const boundMethodCount = CRON_METHODS.filter((cm) => isBoundCarrier(cm)).length;
    expect(boundMethodCount).toBe(CERTIFIED_BOUND_CRON_JOB_COUNT);
    const dormantMethodCount = CRON_METHODS.filter((cm) => !isBoundCarrier(cm)).length;
    expect(dormantMethodCount).toBe(2);
  });

  it('[12] BAGLI her @Cron metodu (govdesinde veya tek-seviye delege ettigi metodda) sertifikali bir failure-reporting cagrisi tasir', () => {
    const violations: string[] = [];
    for (const cm of CRON_METHODS) {
      if (!isBoundCarrier(cm)) continue; // dormant (icrabot) — W3-F06 kapsami
      const eff = effectiveBody(cm);
      if (!CERTIFIED_REPORT_CALL.test(eff)) {
        violations.push(`${cm.file}#${cm.cls}.${cm.method}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('[13] reportCronJobFailure kullanan her TUKETICI dosya onu canonical common modulunden import eder', () => {
    const CANONICAL_FILE = 'common/cron-failure-reporting.ts';
    const missing: string[] = [];
    for (const [file, src] of CLEAN) {
      if (file === CANONICAL_FILE) continue; // tanim dosyasinin kendisi (import gerekmez)
      if (!/reportCronJobFailure\s*\(/.test(src)) continue;
      if (!/from\s*['"][^'"]*common\/cron-failure-reporting['"]/.test(src)) missing.push(file);
    }
    expect(missing).toEqual([]);
  });

  it('[14] DORMANT icrabot @Cron metodlari failure-reporting kontrolunden istisna tutulur (W3-F06 kapsam disi)', () => {
    const dormant = CRON_METHODS.filter((cm) => !isBoundCarrier(cm));
    expect(dormant.length).toBe(2);
    // Bu test hicbir sey ASSERT ETMEZ (mevcut davranislarini degistirmeyiz) — yalniz
    // [12]'nin bunlari BILINCLI atladigini kayit altina alir.
  });
});
