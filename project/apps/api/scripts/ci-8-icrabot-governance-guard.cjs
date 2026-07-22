#!/usr/bin/env node
/*
 * CI-8 — UYAP-ICRABOT-GOVERNANCE-GUARD-P03
 *
 * KARAR 8 (icrabot KARANTİNA) + F4-a WP-E11 / DP-10 uyarınca: açık owner governance GO olmadan
 *   (1) IcrabotModule aktivasyonunu,
 *   (2) apps/api kapsamına RPA dependency eklenmesini,
 *   (3) apps/api source kapsamına gerçek RPA import'u eklenmesini
 * blocking CI guard ile engeller.
 *
 * Guard yalnız STATİK denetim yapar: runtime davranışını değiştirmez, Icrabot'u aktive etmez,
 * Icrabot source'unu silmez, V28EngineModule'u engellemez, apps/web Playwright smoke'unu bozmaz,
 * legacy Python bot dizinlerini taramaz. AST tabanlıdır (raw grep DEĞİL); env-bypass/gizli-allowlist
 * YOKTUR — override yalnız owner-authorized PR ile bu guard'ın değiştirilmesiyle mümkündür.
 *
 * Yeni dependency eklenmez: yalnız apps/api'nin mevcut `typescript` devDependency'si parser olarak
 * kullanılır. Hem CLI olarak çalışır hem saf denetim fonksiyonlarını export eder (acceptance spec).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/** apps/api kapsamında yasak RPA/browser-automation paketleri (exact veya subpath). */
const BLOCKED_RPA_PACKAGES = ['@playwright/test', 'playwright', 'puppeteer', 'selenium-webdriver', 'webdriverio'];

/** Guard ihlalinde üretilen tek kanonik governance mesajı. */
const GOVERNANCE_FAILURE_MESSAGE = 'IcrabotModule/RPA activation requires owner governance GO (KARAR 8)';

const ICRABOT_MODULE_SPECIFIER = './modules/icrabot/icrabot.module';
const ICRABOT_MODULE_IDENTIFIER = 'IcrabotModule';
const SCANNED_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);

/** spec bir blocked pakete (exact) veya onun subpath'ine (pkg/...) mi işaret ediyor? Öyleyse paketi döndürür. */
function matchBlockedPackage(specifier) {
  for (const pkg of BLOCKED_RPA_PACKAGES) {
    if (specifier === pkg || specifier.startsWith(pkg + '/')) return pkg;
  }
  return null;
}

function moduleSpecifierOfImportLike(node) {
  if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (ts.isCallExpression(node)) {
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    if ((isRequire || isDynamicImport) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      return node.arguments[0].text;
    }
  }
  return null;
}

/**
 * GUARD 1 — IcrabotModule aktivasyonu (app.module.ts AST).
 * FAIL: (A) `./modules/icrabot/icrabot.module` gerçek import/import-equals/require/dynamic-import,
 *       (B) @Module({ imports: [...] }) dizisinde aktif `IcrabotModule` identifier.
 * Yorumlar ve string literal açıklamalar ihlal DEĞİLDİR (AST'de token olarak yer almazlar).
 * V28EngineModule ve diğer modules/icrabot/* domain-support importları PASS eder.
 */
function inspectAppModuleSource(source, fileLabel) {
  const label = fileLabel || 'app.module.ts';
  const violations = [];
  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
  } catch (err) {
    return [{ guard: 'module-activation', file: label, detail: 'PARSE_FAILED (fail-closed): ' + err.message }];
  }
  const visit = (node) => {
    const spec = moduleSpecifierOfImportLike(node);
    if (spec === ICRABOT_MODULE_SPECIFIER) {
      let kind = 'ACTIVE_IMPORT';
      if (ts.isImportEqualsDeclaration(node)) kind = 'ACTIVE_IMPORT_EQUALS';
      else if (ts.isCallExpression(node)) {
        kind = node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'ACTIVE_DYNAMIC_IMPORT' : 'ACTIVE_REQUIRE';
      }
      violations.push({ guard: 'module-activation', file: label, detail: kind + ': ' + ICRABOT_MODULE_SPECIFIER });
    }
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      if (
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'Module' &&
        call.arguments.length >= 1 &&
        ts.isObjectLiteralExpression(call.arguments[0])
      ) {
        for (const prop of call.arguments[0].properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'imports' &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            for (const el of prop.initializer.elements) {
              if (ts.isIdentifier(el) && el.text === ICRABOT_MODULE_IDENTIFIER) {
                violations.push({
                  guard: 'module-activation',
                  file: label,
                  detail: 'ACTIVE_REGISTRATION: IcrabotModule in @Module imports',
                });
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/**
 * GUARD 2 — apps/api package manifest (parsed JSON).
 * dependencies/devDependencies/optionalDependencies/peerDependencies bölümlerinde blocked RPA paketi.
 * Malformed JSON → fail-closed (ihlal). apps/web taranmaz.
 */
function inspectApiPackageManifest(jsonText, fileLabel) {
  const label = fileLabel || 'package.json';
  let pkg;
  try {
    pkg = JSON.parse(jsonText);
  } catch (err) {
    return [{ guard: 'api-dependency', file: label, detail: 'MALFORMED_JSON (fail-closed): ' + err.message }];
  }
  if (!pkg || typeof pkg !== 'object') {
    return [{ guard: 'api-dependency', file: label, detail: 'INVALID_MANIFEST (fail-closed)' }];
  }
  const violations = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = pkg[section];
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) {
        const blocked = matchBlockedPackage(name);
        if (blocked) {
          violations.push({ guard: 'api-dependency', file: label, detail: 'BLOCKED_DEPENDENCY: ' + name + ' in ' + section });
        }
      }
    }
  }
  return violations;
}

/** Tek source dosyasında blocked import (AST). Yorum/string ihlal değildir. */
function inspectSingleSourceFile(absPath, baseDir) {
  const rel = path.relative(baseDir, absPath).replace(/\\/g, '/');
  let src;
  try {
    src = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return [{ guard: 'api-import', file: rel, detail: 'UNREADABLE (fail-closed): ' + err.message }];
  }
  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(absPath, src, ts.ScriptTarget.Latest, true);
  } catch (err) {
    return [{ guard: 'api-import', file: rel, detail: 'PARSE_FAILED (fail-closed): ' + err.message }];
  }
  const violations = [];
  const visit = (node) => {
    const spec = moduleSpecifierOfImportLike(node);
    if (spec) {
      const blocked = matchBlockedPackage(spec);
      if (blocked) violations.push({ guard: 'api-import', file: rel, detail: 'BLOCKED_IMPORT: ' + spec });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/**
 * GUARD 3 — apps/api/src altındaki gerçek module import'ları (AST).
 * node_modules/dist/coverage atlanır; apps/web ve legacy uyap_bot_* bu fonksiyonun scope'unda değildir
 * (yalnız verilen srcDir taranır). Blocked paket veya subpath import'u → ihlal.
 */
function inspectApiSourceImports(srcDir, baseDir) {
  const base = baseDir || srcDir;
  const violations = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      violations.push({ guard: 'api-import', file: path.relative(base, dir).replace(/\\/g, '/'), detail: 'UNREADABLE_DIR (fail-closed): ' + err.message });
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(ent.name)) continue;
        walk(full);
      } else if (ent.isFile() && SCANNED_SOURCE_EXTENSIONS.includes(path.extname(ent.name))) {
        violations.push(...inspectSingleSourceFile(full, base));
      }
    }
  };
  walk(srcDir);
  return violations;
}

/** Üç guard'ı apps/api kökü üzerinde birleştirir; deterministik sıralı ihlal listesi döndürür. */
function inspectRepository(apiDir) {
  const violations = [];
  const appModulePath = path.join(apiDir, 'src', 'app.module.ts');
  const packagePath = path.join(apiDir, 'package.json');
  const srcDir = path.join(apiDir, 'src');

  try {
    violations.push(...inspectAppModuleSource(fs.readFileSync(appModulePath, 'utf8'), 'src/app.module.ts'));
  } catch (err) {
    violations.push({ guard: 'module-activation', file: 'src/app.module.ts', detail: 'MISSING_OR_UNREADABLE (fail-closed): ' + err.message });
  }
  try {
    violations.push(...inspectApiPackageManifest(fs.readFileSync(packagePath, 'utf8'), 'package.json'));
  } catch (err) {
    violations.push({ guard: 'api-dependency', file: 'package.json', detail: 'MISSING_OR_UNREADABLE (fail-closed): ' + err.message });
  }
  violations.push(...inspectApiSourceImports(srcDir, apiDir));

  violations.sort((a, b) => (a.guard + '|' + a.file + '|' + a.detail).localeCompare(b.guard + '|' + b.file + '|' + b.detail));
  return violations;
}

function runCli() {
  const apiDir = process.cwd();
  const violations = inspectRepository(apiDir);
  if (violations.length > 0) {
    console.error(GOVERNANCE_FAILURE_MESSAGE);
    for (const v of violations) console.error('  [' + v.guard + '] ' + v.file + ': ' + v.detail);
    process.exit(1);
  }
  console.log('Icrabot quarantine guard: PASS — apps/api has no active IcrabotModule, no RPA dependency, no RPA import.');
  process.exit(0);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  inspectAppModuleSource,
  inspectApiPackageManifest,
  inspectApiSourceImports,
  inspectRepository,
  BLOCKED_RPA_PACKAGES,
  GOVERNANCE_FAILURE_MESSAGE,
};
