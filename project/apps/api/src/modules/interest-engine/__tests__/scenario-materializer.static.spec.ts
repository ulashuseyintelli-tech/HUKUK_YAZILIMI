/**
 * ADR-014 W0.2 — Materializer statik sınır guard'ı (G4 + Acceptance Criteria §13).
 *
 * Kalıcı kilitler:
 * 1) PRODUCTION-ERİŞİLEMEZLİK (G4): production kaynak dosyaları (module/service/
 *    controller vb. — test/spec dışı) scenario-materializer'ı IMPORT EDEMEZ.
 *    Materializer yalnız test-support'tur; runtime authority olamaz (§7).
 * 2) BAĞIMLILIK FREEZE (§13): materializer dosyaları '@nestjs/*', ortam değişkeni
 *    erişimi ('process.env') ve 'DATABASE_URL' içeremez; '@prisma/client' yalnız
 *    bu adapter sınırında İZİNLİDİR. Import yüzeyi yalnız @prisma/client +
 *    scenario-support contract'ı ile sınırlıdır (competing contract yasağı, §9).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');
const MATERIALIZER_DIR = path.resolve(__dirname, '..', 'scenario-materializer');

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

describe('W0.2 scenario-materializer statik sınırları (G4 + §13)', () => {
  const allSrcFiles = walk(SRC_ROOT);

  it('G4: hiçbir production kaynak dosyası scenario-materializer import etmez', () => {
    const offenders: string[] = [];
    for (const file of allSrcFiles) {
      if (isTestSupportPath(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('scenario-materializer')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('§13: materializer dosyaları yasak bağımlılık içermez (@nestjs, env erişimi, DATABASE_URL)', () => {
    const files = walk(MATERIALIZER_DIR);
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

  it('§9/§13: materializer import yüzeyi yalnız @prisma/client + scenario-support contract', () => {
    const files = walk(MATERIALIZER_DIR);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      const disallowed = imports.filter(
        (i) => i !== '@prisma/client' && !i.startsWith('../scenario-support/'),
      );
      expect({ file, disallowed }).toEqual({ file, disallowed: [] });
    }
  });
});
