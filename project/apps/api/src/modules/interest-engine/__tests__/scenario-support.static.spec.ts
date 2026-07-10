/**
 * ADR-014 W0.1 — scenario-support SAFLIK guard'ı (statik).
 *
 * Owner arbitration (2026-07-10, bağlayıcı): ScenarioDefinition contract'ı ve
 * shared builder SAF/persistence-bağımsız kalmak ZORUNDA — Prisma, Nest, DB
 * bağlantısı veya env erişimi bu dosyalara SIZAMAZ. Bu spec, o kuralı kalıcı
 * bir regresyon kilidi olarak uygular (kaynak metni okur, yasak token arar).
 *
 * W0.2 materializer bu guard'ın KAPSAMINDA DEĞİLDİR — materializer bilinçli
 * olarak Prisma'ya dokunur (test/disposable DB'de) ve AYRI dosyada yaşayacaktır.
 */
import * as fs from 'fs';
import * as path from 'path';

const SUPPORT_DIR = path.join(__dirname, '..', 'scenario-support');
const GUARDED_FILES = ['scenario-definition.ts', 'scenario-builder.ts'];
const FORBIDDEN_TOKENS = ['@prisma/client', 'PrismaClient', '@nestjs/', 'DATABASE_URL', 'process.env'];

describe('ADR-014 W0.1 — scenario-support saflık guard (statik)', () => {
  for (const file of GUARDED_FILES) {
    describe(file, () => {
      const content = fs.readFileSync(path.join(SUPPORT_DIR, file), 'utf8');

      it('dosya mevcut ve boş değil', () => {
        expect(content.length).toBeGreaterThan(0);
      });

      for (const token of FORBIDDEN_TOKENS) {
        it(`'${token}' içermez`, () => {
          expect(content.includes(token)).toBe(false);
        });
      }

      it("yalnız type-import veya yerel import kullanır (require/dinamik import yok)", () => {
        expect(content.includes('require(')).toBe(false);
        expect(content.includes('import(')).toBe(false);
      });
    });
  }
});
