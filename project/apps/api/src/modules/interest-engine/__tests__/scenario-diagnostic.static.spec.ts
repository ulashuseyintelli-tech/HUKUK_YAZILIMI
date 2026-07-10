/**
 * ADR-014 W0.3 — Diagnostic dual-mode statik sınır guard'ı.
 *
 * Kalıcı kilitler (Acceptance Criteria):
 * 1) PRODUCTION-ERİŞİLEMEZLİK (§7/§16): production kaynak dosyaları
 *    (test-support dışı) scenario-diagnostic'i IMPORT EDEMEZ — diagnostic
 *    katmanı runtime authority olamaz.
 * 2) BAĞIMLILIK FREEZE (§13): diagnostic dosyalarında '@nestjs/*' ve ortam
 *    değişkeni erişimi YOKTUR; PrismaClient seam (parametre) arkasındadır.
 * 3) ASSERTION SAFLIĞI (§12): scenario-evidence.ts HESAPLAYAMAZ — engine/
 *    allocation/materializer/Prisma import etmesi yasaktır; yalnız W0.1
 *    contract'ı ve display tiplerinden type-import yapabilir.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');
const DIAGNOSTIC_DIR = path.resolve(__dirname, '..', 'scenario-diagnostic');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function isTestSupportPath(p: string): boolean {
  const n = p.replace(/\\/g, '/');
  return (
    n.includes('/__tests__/') ||
    n.endsWith('.spec.ts') ||
    n.includes('/scenario-materializer/') ||
    n.includes('/scenario-support/') ||
    n.includes('/scenario-diagnostic/')
  );
}

describe('W0.3 scenario-diagnostic statik sınırları', () => {
  it('§7/§16: hiçbir production kaynak dosyası scenario-diagnostic import etmez', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (isTestSupportPath(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('scenario-diagnostic')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('§13: diagnostic dosyaları yasak bağımlılık içermez (@nestjs, env erişimi, DATABASE_URL)', () => {
    const files = walk(DIAGNOSTIC_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const token of ['@nestjs/', 'process.env', 'DATABASE_URL']) {
        expect({ file, token, found: content.includes(token) }).toEqual({
          file,
          token,
          found: false,
        });
      }
    }
  });

  it('§12: scenario-evidence.ts saftır — import yüzeyi yalnız contract + display type-importları', () => {
    const content = fs.readFileSync(path.join(DIAGNOSTIC_DIR, 'scenario-evidence.ts'), 'utf-8');
    const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    const disallowed = imports.filter(
      (i) =>
        i !== '../scenario-support/scenario-definition' &&
        i !== '../orchestration/case-balance-display',
    );
    expect(disallowed).toEqual([]);
    // Hesap-motoru sızıntısına karşı açık negatifler:
    for (const token of ['@prisma/client', 'scenario-materializer', 'interest-engine.service', 'allocation']) {
      expect({ token, found: content.includes(token) }).toEqual({ token, found: false });
    }
  });

  it('runner import yüzeyi bilinen test-adapter bağımlılıklarıyla sınırlıdır', () => {
    const content = fs.readFileSync(
      path.join(DIAGNOSTIC_DIR, 'scenario-diagnostic-runner.ts'),
      'utf-8',
    );
    const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    const allowedPrefixes = [
      '@prisma/client',
      './scenario-evidence',
      '../scenario-support/',
      '../scenario-materializer/',
      '../orchestration/',
      '../rates/',
      '../interest-engine.service',
      '../policy-gate/',
      '../segments/',
      '../version/',
      '../allocation/',
    ];
    const disallowed = imports.filter((i) => !allowedPrefixes.some((p) => i.startsWith(p)));
    expect(disallowed).toEqual([]);
  });

  it('organik gözlem sırası createdAt eşitliğinde id ile deterministiktir', () => {
    const content = fs.readFileSync(
      path.join(DIAGNOSTIC_DIR, 'scenario-diagnostic-runner.ts'),
      'utf-8',
    );
    expect(content).toContain("orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]");
  });

  it('failure sınıfları yalnız diagnostic aşamalarıdır ve authority üretmez', () => {
    const content = fs.readFileSync(
      path.join(DIAGNOSTIC_DIR, 'scenario-diagnostic-runner.ts'),
      'utf-8',
    );
    for (const stage of ['SETUP', 'CALCULATION', 'OBSERVATION', 'CLEANUP']) {
      expect(content).toContain(`'${stage}'`);
    }
    for (const token of ['CANONICAL_CANDIDATE', 'LEGAL_RESULT', 'fallbackCalculation']) {
      expect({ token, found: content.includes(token) }).toEqual({ token, found: false });
    }
  });
});
