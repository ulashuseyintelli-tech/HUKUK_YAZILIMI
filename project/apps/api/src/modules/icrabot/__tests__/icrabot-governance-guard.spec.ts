/**
 * UYAP-ICRABOT-GOVERNANCE-GUARD-P03 — acceptance tests.
 *
 * CI-8 Icrabot quarantine guard'ının (scripts/ci-8-icrabot-governance-guard.cjs) davranışını doğrular.
 * Fixture'lar temp/in-memory'dir; gerçek app.module.ts / package.json test sırasında DEĞİŞTİRİLMEZ
 * (yalnız CLEAN-TREE senaryosunda READ-ONLY okunur). Guard AST tabanlıdır; yorum/string ihlal değildir.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../../../scripts/ci-8-icrabot-governance-guard.cjs');

const API_DIR = path.resolve(__dirname, '../../../../');
const GUARD_SCRIPT = path.resolve(API_DIR, 'scripts/ci-8-icrabot-governance-guard.cjs');

/** Geçici izole apps/api-benzeri ağaç: src/app.module.ts + package.json + istenirse ek source. */
function makeTempApiTree(opts: {
  appModuleSource: string;
  packageJson: string;
  extraSources?: Array<{ relPath: string; content: string }>;
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icrabot-guard-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.module.ts'), opts.appModuleSource, 'utf8');
  fs.writeFileSync(path.join(dir, 'package.json'), opts.packageJson, 'utf8');
  for (const extra of opts.extraSources ?? []) {
    const full = path.join(dir, extra.relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, extra.content, 'utf8');
  }
  return dir;
}

const CLEAN_APP_MODULE = `
import { Module } from '@nestjs/common';
import { V28EngineModule } from './modules/icrabot/v28-engine/v28-engine.module';
// import { IcrabotModule } from './modules/icrabot/icrabot.module';
@Module({ imports: [V28EngineModule /* IcrabotModule */] })
export class AppModule {}
`;
const CLEAN_PACKAGE = JSON.stringify({ name: '@hukuk/api', devDependencies: { typescript: '^5.3.3' } }, null, 2);

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
});
function tempTree(opts: Parameters<typeof makeTempApiTree>[0]): string {
  const d = makeTempApiTree(opts);
  tmpDirs.push(d);
  return d;
}

describe('UYAP-ICRABOT-GOVERNANCE-GUARD-P03 — quarantine guard acceptance', () => {
  it('exposes the canonical governance message and blocked package set', () => {
    expect(guard.GOVERNANCE_FAILURE_MESSAGE).toBe(
      'IcrabotModule/RPA activation requires owner governance GO (KARAR 8)',
    );
    expect(guard.BLOCKED_RPA_PACKAGES).toEqual(
      expect.arrayContaining(['playwright', '@playwright/test', 'selenium-webdriver', 'puppeteer', 'webdriverio']),
    );
  });

  // TEST-01 — CLEAN TREE PASS (gerçek repository baseline, READ-ONLY)
  it('TEST-01 — real repository baseline PASSES (no violations)', () => {
    const violations = guard.inspectRepository(API_DIR);
    expect(violations).toEqual([]);
  });

  // TEST-02 — MODULE ACTIVATION FAIL
  it('TEST-02 — active IcrabotModule import + registration FAILS', () => {
    const activated = `
import { Module } from '@nestjs/common';
import { IcrabotModule } from './modules/icrabot/icrabot.module';
@Module({ imports: [IcrabotModule] })
export class AppModule {}
`;
    const v = guard.inspectAppModuleSource(activated, 'src/app.module.ts');
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x: any) => x.detail.includes('ACTIVE_IMPORT'))).toBe(true);
    expect(v.some((x: any) => x.detail.includes('ACTIVE_REGISTRATION'))).toBe(true);
  });

  // TEST-03 — API DEPENDENCY FAIL
  it('TEST-03 — apps/api RPA dependency FAILS (playwright / @playwright/test)', () => {
    const withPlaywright = JSON.stringify({ dependencies: { playwright: '^1.0.0' } });
    const withPlaywrightTest = JSON.stringify({ devDependencies: { '@playwright/test': '^1.0.0' } });
    expect(guard.inspectApiPackageManifest(withPlaywright, 'package.json').length).toBeGreaterThan(0);
    expect(guard.inspectApiPackageManifest(withPlaywrightTest, 'package.json').length).toBeGreaterThan(0);
  });

  // TEST-04 — API IMPORT FAIL
  it('TEST-04 — real RPA import in apps/api source FAILS', () => {
    const dir = tempTree({
      appModuleSource: CLEAN_APP_MODULE,
      packageJson: CLEAN_PACKAGE,
      extraSources: [
        { relPath: 'src/modules/bad/uses-playwright.ts', content: `import { chromium } from 'playwright';\nexport const x = chromium;\n` },
      ],
    });
    const v = guard.inspectApiSourceImports(path.join(dir, 'src'), dir);
    expect(v.some((x: any) => x.detail.includes('BLOCKED_IMPORT: playwright'))).toBe(true);
    // subpath da yasak
    const dir2 = tempTree({
      appModuleSource: CLEAN_APP_MODULE,
      packageJson: CLEAN_PACKAGE,
      extraSources: [{ relPath: 'src/x/y.ts', content: `const p = require('puppeteer/lib/api');\n` }],
    });
    expect(guard.inspectApiSourceImports(path.join(dir2, 'src'), dir2).some((x: any) => x.detail.includes('BLOCKED_IMPORT: puppeteer/lib/api'))).toBe(true);
  });

  // TEST-05 — WEB SMOKE PASS (apps/web @playwright/test taranmaz; apps/api temiz PASS)
  it('TEST-05 — apps/api clean PASSES even though apps/web keeps @playwright/test', () => {
    // Guard yalnız apps/api manifestini denetler; apps/web taranmaz. Temiz apps/api → 0 ihlal.
    expect(guard.inspectApiPackageManifest(CLEAN_PACKAGE, 'package.json')).toEqual([]);
    const dir = tempTree({ appModuleSource: CLEAN_APP_MODULE, packageJson: CLEAN_PACKAGE });
    expect(guard.inspectRepository(dir)).toEqual([]);
  });

  // TEST-06 — FALSE-POSITIVE CONTROL PASS (yorum/string + aktif V28EngineModule)
  it('TEST-06 — comments/strings mentioning IcrabotModule/playwright/puppeteer + active V28EngineModule PASS', () => {
    const falsePositiveSource = `
import { Module } from '@nestjs/common';
import { V28EngineModule } from './modules/icrabot/v28-engine/v28-engine.module';
// import { IcrabotModule } from './modules/icrabot/icrabot.module';  // playwright puppeteer notu
const doc = 'IcrabotModule and playwright and puppeteer are only strings here';
@Module({ imports: [V28EngineModule /* IcrabotModule, playwright */] })
export class AppModule { readonly note = doc; }
`;
    expect(guard.inspectAppModuleSource(falsePositiveSource, 'src/app.module.ts')).toEqual([]);
    // yorum/string içeren bir source dosyası da import-guard'ı kırmaz
    const dir = tempTree({
      appModuleSource: CLEAN_APP_MODULE,
      packageJson: CLEAN_PACKAGE,
      extraSources: [{ relPath: 'src/notes.ts', content: `// playwright puppeteer selenium-webdriver\nexport const s = 'playwright is a string';\n` }],
    });
    expect(guard.inspectApiSourceImports(path.join(dir, 'src'), dir)).toEqual([]);
  });

  // Ek — malformed / missing input fail-closed
  it('malformed apps/api package.json is fail-closed (violation)', () => {
    expect(guard.inspectApiPackageManifest('{ not valid json', 'package.json').length).toBeGreaterThan(0);
  });
  it('missing required input (no app.module/package.json) is fail-closed', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icrabot-guard-empty-'));
    tmpDirs.push(emptyDir);
    const v = guard.inspectRepository(emptyDir);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x: any) => x.detail.includes('MISSING_OR_UNREADABLE'))).toBe(true);
  });

  // Ek — violation list deterministic/sorted
  it('violation list is deterministic and sorted', () => {
    const dir = tempTree({
      appModuleSource: `import { IcrabotModule } from './modules/icrabot/icrabot.module';\n@Module({ imports: [IcrabotModule] }) export class AppModule {}\n`,
      packageJson: JSON.stringify({ dependencies: { puppeteer: '^1.0.0' } }),
      extraSources: [{ relPath: 'src/z.ts', content: `import 'webdriverio';\n` }],
    });
    const first = guard.inspectRepository(dir);
    const second = guard.inspectRepository(dir);
    expect(first).toEqual(second);
    const keys = first.map((x: any) => x.guard + '|' + x.file + '|' + x.detail);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  // Ek — CLI exit codes (child_process): clean → 0, violation → non-zero + governance mesajı
  it('CLI exits 0 on a clean tree', () => {
    const dir = tempTree({ appModuleSource: CLEAN_APP_MODULE, packageJson: CLEAN_PACKAGE });
    const out = execFileSync('node', [GUARD_SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(out).toContain('PASS');
  });
  it('CLI exits non-zero on a violating tree and prints the governance message', () => {
    const dir = tempTree({
      appModuleSource: `import { IcrabotModule } from './modules/icrabot/icrabot.module';\n@Module({ imports: [IcrabotModule] }) export class AppModule {}\n`,
      packageJson: CLEAN_PACKAGE,
    });
    let code = 0;
    let stderr = '';
    try {
      execFileSync('node', [GUARD_SCRIPT], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err: any) {
      code = err.status ?? 1;
      stderr = String(err.stderr ?? '');
    }
    expect(code).not.toBe(0);
    expect(stderr).toContain('IcrabotModule/RPA activation requires owner governance GO (KARAR 8)');
  });
});
