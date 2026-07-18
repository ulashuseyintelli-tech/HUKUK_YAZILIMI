import * as fs from 'fs';
import * as path from 'path';
import { ALLOCATION_AUTHORITY_INVENTORY_V1 } from '../allocation-drift-baseline';

const apiRoot = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(apiRoot, relativePath), 'utf8');
}

function productionTypeScriptFiles(root: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      results.push(...productionTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('WS04-P01 static allocation authority inventory guard', () => {
  it('canonical writer/reader inventory içindeki bütün production kaynakları mevcut', () => {
    const inventoryPaths = Object.values(ALLOCATION_AUTHORITY_INVENTORY_V1).flat();
    expect(inventoryPaths.length).toBeGreaterThan(0);
    for (const relativePath of inventoryPaths) {
      expect(fs.existsSync(path.join(apiRoot, relativePath))).toBe(true);
    }
  });

  it.each(ALLOCATION_AUTHORITY_INVENTORY_V1.runtimeCalculators)(
    '%s runtime calculation-only kalır ve persistence yüzeyi taşımaz',
    (relativePath) => {
      const source = read(relativePath);
      expect(source).not.toMatch(/PrismaService|@prisma\/client|\$transaction/);
      expect(source).not.toMatch(
        /ledgerEntry|ledgerAllocation|collectionAllocation|collectedAmount\s*:\s*\{\s*(increment|decrement)/,
      );
    },
  );

  it('direct CollectionAllocation mutation yalnız compatibility projection writer içinde kalır', () => {
    const mutationPattern = /collectionAllocation\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const matches = productionTypeScriptFiles(path.join(apiRoot, 'src'))
      .filter((file) => mutationPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(apiRoot, file).replaceAll('\\', '/'));

    expect(matches).toEqual([
      'src/modules/collection/collection.service.ts',
    ]);
  });

  it('collectedAmount increment/decrement writer allowlist dışına taşmaz', () => {
    const mutationPattern = /collectedAmount\s*:\s*\{\s*(increment|decrement)\s*:/;
    const matches = productionTypeScriptFiles(path.join(apiRoot, 'src'))
      .filter((file) => mutationPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(apiRoot, file).replaceAll('\\', '/'))
      .sort();

    expect(matches).toEqual([
      'src/modules/collection/collection-cancel-executor.ts',
      'src/modules/summary-engine/summary-engine.service.ts',
    ]);
  });

  it('LedgerAllocation legal writer ve CollectionAllocation projection reader sınırları görünür kalır', () => {
    const summary = read('src/modules/summary-engine/summary-engine.service.ts');
    const cancellation = read('src/modules/collection/collection-cancel-executor.ts');
    const collection = read('src/modules/collection/collection.service.ts');

    expect(summary).toContain('allocations: {');
    expect(summary).toContain('RUNTIME_ALLOCATION_TO_PERSISTED_LEDGER_ALLOCATION');
    expect(summary).toContain('LEDGER_ALLOCATION_TO_CLAIM_ITEM_COLLECTED_AMOUNT');
    expect(cancellation).toContain('entryType: "REVERSAL"');
    expect(cancellation).toContain('allocations: {');
    expect(collection).toContain('LedgerAllocation = legal SoT');
    expect(collection).toContain('CollectionAllocation = geçici compat/gölge');
    expect(collection).toContain('LEDGER-ONLY');
  });
});
