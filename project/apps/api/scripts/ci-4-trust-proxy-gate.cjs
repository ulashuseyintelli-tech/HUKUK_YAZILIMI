#!/usr/bin/env node
'use strict';
/**
 * CI-4 Trust proxy gate — ortak yapilandirma kablolamasinin statik denetimi.
 *
 * Dogrulanan iliskiler:
 *   1. main.ts `applyTrustProxy`'yi "./common/trust-proxy.config" modulunden, takma adsiz import eder
 *      ve ayni adla yerel bir tanim YAPMAZ.
 *   2. `bootstrap` fonksiyonunun govdesinde, ust duzey bir ifade olarak, `NestFactory.create(...)`
 *      ile olusturulan AYNI app degiskeniyle `applyTrustProxy(app);` TAM BIR KEZ cagrilir ve bu
 *      cagri `app.listen(` oncesindedir; `bootstrap()` modulun ust duzeyinde cagrilir.
 *   3. trust-proxy.config.ts'teki `applyTrustProxy(<p>)` govdesi, ust duzey ifade olarak
 *      `<p>.getHttpAdapter().getInstance().set("trust proxy", TRUST_PROXY_HOPS)` cagrisini icerir.
 *   4. `export const TRUST_PROXY_HOPS = 1;`
 *   5. apps/api/src altinda (test dosyalari haric) "trust proxy" string'i yalniz ortak yapilandirmada gecer.
 *
 * Yontem: bagimliliksiz sozcuk tarayici — yorumlar silinir, string/template icerikleri yer tutucuya
 * cevrilir (yorumdaki veya string icindeki kod SAYILMAZ), sonra suslu parantez eslemesiyle fonksiyon
 * govdeleri ve ust duzey ifadeler bulunur.
 * SINIRLAR (durustce): tam bir TypeScript AST'si DEGILDIR (CI guardrails job'inda node_modules yok).
 * Regex literalleri ozel islenmez; ifadenin CALISMA ZAMANINDA erisilebilirligi (or. cagridan once kosulsuz
 * `return`/`throw`) ve Nest/Express'in ayari gercekten uyguladigi DENETLENMEZ — o davranis
 * src/tests/trust-proxy.spec.ts ile dogrulanir.
 */
const fs = require('fs');
const path = require('path');

const API_ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(API_ROOT, 'src', 'main.ts');
const CONFIG = path.join(API_ROOT, 'src', 'common', 'trust-proxy.config.ts');
const CONFIG_IMPORT = './common/trust-proxy.config';

/** Yorumlari siler, string/template iceriklerini `"@S<n>@"` yer tutucusuna cevirir. */
function scan(src) {
  const strings = [];
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let val = '';
      let depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { val += src[j + 1]; j += 2; continue; }
        if (c === '`' && ch === '$' && src[j + 1] === '{') { depth++; val += '${'; j += 2; continue; }
        if (c === '`' && ch === '}' && depth > 0) { depth--; val += ch; j++; continue; }
        if (ch === c && depth === 0) break;
        val += ch;
        j++;
      }
      strings.push(val);
      out += `"@S${strings.length - 1}@"`;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return { code: out, strings };
}

const strVal = (s, token) => {
  const m = /^"@S(\d+)@"$/.exec(token.trim());
  return m ? s.strings[Number(m[1])] : undefined;
};

/** `from` indeksindeki `{`'nin eslesen `}` indeksi. */
function matchBrace(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Govdenin (suslu parantezler haric) yalniz derinlik-0 kismi; ic bloklar bosluga cevrilir. */
function topLevel(body) {
  let depth = 0;
  let out = '';
  for (const ch of body) {
    if (ch === '{') { depth++; out += ' '; continue; }
    if (ch === '}') { depth--; out += ' '; continue; }
    out += depth === 0 ? ch : (ch === '\n' ? '\n' : ' ');
  }
  return out;
}

function functionBody(code, nameRe) {
  const m = nameRe.exec(code);
  if (!m) return null;
  const open = code.indexOf('{', m.index + m[0].length - 1);
  const close = matchBrace(code, open);
  if (open === -1 || close === -1) return null;
  return { match: m, body: code.slice(open + 1, close), start: m.index, end: close };
}

function checkMain(src) {
  const errors = [];
  const s = scan(src);
  const code = s.code;

  // 1. import
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*("@S\d+@")\s*;?/g)];
  const imp = imports.filter((m) => m[1].split(',').map((x) => x.trim()).some((x) => /^applyTrustProxy(\s+as\s+\w+)?$/.test(x)));
  if (imp.length !== 1) {
    errors.push(`main.ts applyTrustProxy import'u tam bir kez bulunmali (bulunan: ${imp.length})`);
  } else {
    const names = imp[0][1].split(',').map((x) => x.trim());
    if (!names.includes('applyTrustProxy')) errors.push('main.ts applyTrustProxy takma adla (as) import edilmemeli');
    if (strVal(s, imp[0][2]) !== CONFIG_IMPORT) {
      errors.push(`main.ts applyTrustProxy yanlis modulden import ediliyor: "${strVal(s, imp[0][2])}" (beklenen "${CONFIG_IMPORT}")`);
    }
  }
  if (/\b(function|const|let|var|class)\s+applyTrustProxy\b/.test(code)) {
    errors.push('main.ts applyTrustProxy adinda yerel tanim icermemeli');
  }

  // 2. bootstrap govdesi
  const fn = functionBody(code, /async\s+function\s+bootstrap\s*\(\s*\)\s*\{/);
  if (!fn) {
    errors.push('main.ts async function bootstrap() bulunamadi');
    return errors;
  }
  const outside = code.slice(0, fn.start) + code.slice(fn.end + 1);
  if (!/^\s*bootstrap\s*\(\s*\)\s*;/m.test(topLevel(outside))) {
    errors.push('main.ts bootstrap() ust duzeyde cagrilmiyor');
  }
  const top = topLevel(fn.body);
  const create = /\bconst\s+(\w+)\s*=\s*await\s+NestFactory\.create\s*\(/.exec(top);
  if (!create) {
    errors.push('bootstrap icinde ust duzey `const <app> = await NestFactory.create(` bulunamadi');
    return errors;
  }
  const app = create[1];
  const calls = [...top.matchAll(/(^|[;\s])applyTrustProxy\s*\(\s*(\w+)\s*\)\s*;/g)];
  const anyCall = (fn.body.match(/\bapplyTrustProxy\s*\(/g) || []).length;
  if (calls.length !== 1 || anyCall !== 1) {
    errors.push(`bootstrap icinde ust duzey applyTrustProxy(...) cagrisi tam bir kez olmali (ust duzey: ${calls.length}, toplam: ${anyCall})`);
  } else {
    const call = calls[0];
    if (call[2] !== app) errors.push(`applyTrustProxy NestFactory.create ile olusturulan app ile cagrilmiyor (beklenen ${app}, bulunan ${call[2]})`);
    const callIdx = call.index;
    if (callIdx < create.index) errors.push('applyTrustProxy NestFactory.create oncesinde cagriliyor');
    const listen = new RegExp(`\\b${app}\\.listen\\s*\\(`).exec(top);
    if (!listen) errors.push(`bootstrap icinde ust duzey ${app}.listen( bulunamadi`);
    else if (callIdx > listen.index) errors.push(`applyTrustProxy ${app}.listen( SONRASINDA cagriliyor`);
  }
  return errors;
}

function checkConfig(src) {
  const errors = [];
  const s = scan(src);
  const code = s.code;
  const hops = [...code.matchAll(/export\s+const\s+TRUST_PROXY_HOPS\s*(?::\s*\w+\s*)?=\s*([^;\n]+);/g)];
  if (hops.length !== 1) errors.push(`TRUST_PROXY_HOPS tanimi tam bir kez olmali (bulunan: ${hops.length})`);
  else if (hops[0][1].trim() !== '1') errors.push(`TRUST_PROXY_HOPS = 1 olmali (bulunan: ${hops[0][1].trim()})`);

  const fn = functionBody(code, /export\s+function\s+applyTrustProxy\s*\(\s*(\w+)\s*(?::[^)]*)?\)\s*(?::\s*void\s*)?\{/);
  if (!fn) {
    errors.push('export function applyTrustProxy(<app>) bulunamadi');
    return errors;
  }
  const p = fn.match[1];
  const top = topLevel(fn.body);
  const re = new RegExp(`(^|[;\\s])${p}\\s*\\.\\s*getHttpAdapter\\s*\\(\\s*\\)\\s*\\.\\s*getInstance\\s*\\(\\s*\\)\\s*\\.\\s*set\\s*\\(\\s*("@S\\d+@")\\s*,\\s*TRUST_PROXY_HOPS\\s*\\)\\s*;`, 'g');
  const sets = [...top.matchAll(re)].filter((m) => strVal(s, m[2]) === 'trust proxy');
  if (sets.length !== 1) {
    errors.push(`applyTrustProxy govdesinde ust duzey ${p}.getHttpAdapter().getInstance().set("trust proxy", TRUST_PROXY_HOPS) tam bir kez olmali (bulunan: ${sets.length})`);
  }
  return errors;
}

function checkSingleSource() {
  const errors = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'tests' || e.name === 'node_modules' ? [] : walk(f);
    return f.endsWith('.ts') && !f.endsWith('.spec.ts') ? [f] : [];
  });
  const files = walk(path.join(API_ROOT, 'src'));
  for (const f of files) {
    if (path.resolve(f) === path.resolve(CONFIG)) continue;
    const s = scan(fs.readFileSync(f, 'utf8'));
    if (s.strings.some((v) => v.toLowerCase() === 'trust proxy')) {
      errors.push(`"trust proxy" ayari ortak yapilandirma DISINDA: ${path.relative(API_ROOT, f)}`);
    }
  }
  return { errors, scanned: files.length };
}

// Self-test fiksturleri gercek dosyalardan BAGIMSIZDIR: gercek dosyadaki bir hata kendi mesajiyla raporlanir.
const FIXTURE_MAIN = [
  'import { NestFactory } from "@nestjs/core";',
  'import { AppModule } from "./app.module";',
  'import { applyTrustProxy } from "./common/trust-proxy.config";',
  '',
  'async function bootstrap() {',
  '  const app = await NestFactory.create(AppModule);',
  '',
  '  applyTrustProxy(app);',
  '',
  '  app.enableCors({ origin: ["http://localhost:3000"] });',
  '  await app.listen(8080);',
  '}',
  '',
  'bootstrap();',
  '',
].join('\n');
const FIXTURE_CFG = [
  'import type { INestApplication } from "@nestjs/common";',
  'export const TRUST_PROXY_HOPS = 1;',
  'export function applyTrustProxy(app: INestApplication): void {',
  '  app.getHttpAdapter().getInstance().set("trust proxy", TRUST_PROXY_HOPS);',
  '}',
  '',
].join('\n');

function selfTest() {
  const okMain = FIXTURE_MAIN;
  const okCfg = FIXTURE_CFG;
  const positive = [...checkMain(okMain), ...checkConfig(okCfg)];
  if (positive.length) {
    console.log(`CI-4 FAIL: self-test pozitif fikstur reddedildi: ${positive.join(' | ')}`);
    process.exit(1);
  }
  const call = /^([ \t]*)applyTrustProxy\((\w+)\);[ \t]*\r?\n/m;
  // [ad, kontrol, kaynak, degisim] — degisim kaynagi DEGISTIRMEZSE fikstur uygulanamamis sayilir (FAIL).
  const cases = [
    ['main: yanlis modul', checkMain, okMain, (t) => t.replace(/(["'])\.\/common\/trust-proxy\.config\1/, '"./common/other.config"')],
    ['main: cagri yorumlanmis', checkMain, okMain, (t) => t.replace(call, '$1// applyTrustProxy($2);\n')],
    ['main: cagri string icinde', checkMain, okMain, (t) => t.replace(call, '$1const x = "applyTrustProxy($2);";\n')],
    ['main: listen sonrasi', checkMain, okMain, (t) => {
      const m = call.exec(t);
      return m ? t.replace(call, '').replace(/(await\s+(\w+)\.listen\([^)]*\);)/, `$1\n${m[1]}applyTrustProxy(${m[2]});`) : t;
    }],
    ['main: ic blokta (kosullu)', checkMain, okMain, (t) => t.replace(call, '$1if (process.env.X) { applyTrustProxy($2); }\n')],
    ['config: hop=2', checkConfig, okCfg, (t) => t.replace(/(TRUST_PROXY_HOPS\s*(?::\s*\w+\s*)?=\s*)1\s*;/, '$12;')],
    ['config: set yorumlanmis', checkConfig, okCfg, (t) => t.replace(/^([ \t]*)(\w+\.getHttpAdapter\(\))/m, '$1// $2')],
  ];
  const unapplied = cases.filter(([, , src, mutate]) => mutate(src) === src).map(([name]) => name);
  if (unapplied.length) {
    console.log(`CI-4 FAIL: self-test fiksturu uygulanamadi (kaynak bicimi degismis olabilir): ${unapplied.join(', ')}`);
    process.exit(1);
  }
  const bad = cases.filter(([, check, src, mutate]) => check(mutate(src)).length === 0).map(([name]) => name);
  if (bad.length) {
    console.log(`CI-4 FAIL: self-test negatif durumlari yakalamadi: ${bad.join(', ')}`);
    process.exit(1);
  }
  console.log(`CI-4 self-test: ${cases.length}/${cases.length} negatif durum yakalandi`);
}

function main() {
  if (!fs.existsSync(MAIN) || !fs.existsSync(CONFIG)) {
    console.log(`CI-4 FAIL: dosya yok (${!fs.existsSync(MAIN) ? 'src/main.ts' : 'src/common/trust-proxy.config.ts'})`);
    process.exit(1);
  }
  selfTest();
  const single = checkSingleSource();
  const errors = [
    ...checkMain(fs.readFileSync(MAIN, 'utf8')),
    ...checkConfig(fs.readFileSync(CONFIG, 'utf8')),
    ...single.errors,
  ];
  if (single.scanned === 0) errors.push('src altinda taranan .ts dosyasi yok (kor tarama)');
  if (errors.length) {
    for (const e of errors) console.log(`CI-4 FAIL: ${e}`);
    process.exit(1);
  }
  console.log(`CI-4 PASS: main.ts applyTrustProxy(app) -> ${CONFIG_IMPORT} (listen oncesi, tek cagri); TRUST_PROXY_HOPS = 1; tek kaynak (${single.scanned} dosya tarandi)`);
}

main();
