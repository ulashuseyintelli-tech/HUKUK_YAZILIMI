import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1,
} from '../allocation-representative-replay-adapter';

const projectRoot = path.resolve(process.cwd(), '..', '..');
const apiRoot = path.join(projectRoot, 'apps', 'api');
const webRoot = path.join(projectRoot, 'apps', 'web');

describe('RCV-P2-WS04-P03 static authority, no-write and consumer guards', () => {
  it('adapter has no source write, DDL, network, telemetry, schema or runtime authority surface', () => {
    const source = read('apps/api/src/modules/summary-engine/allocation-representative-replay-adapter.ts');
    const allowedManualLaunchImport =
      'src/scripts/rcv-ws04-p03-allocation-replay-launch.ts';
    const productionImports = sourceFiles(path.join(apiRoot, 'src'))
      .filter((file) =>
        relative(apiRoot, file) !==
        'src/modules/summary-engine/allocation-representative-replay-adapter.ts')
      .filter((file) => relative(apiRoot, file) !== allowedManualLaunchImport)
      .filter((file) =>
        /from\s+['"][^'"]*allocation-representative-replay-adapter['"]/
          .test(fs.readFileSync(file, 'utf8')))
      .map((file) => relative(apiRoot, file));

    expect(source).not.toMatch(/\b(PrismaClient|fetch|axios|http|https|net|telemetry)\b/);
    expect(source).not.toMatch(
      /['"`]\s*(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|COPY)\b/i,
    );
    expect(source).not.toContain('$executeRaw');
    expect(source).not.toContain('schema.prisma');
    expect(source).not.toContain('TBK100AllocatorService');
    expect(source).not.toContain('CollectionAllocation.create');
    expect(source).not.toContain('LedgerAllocation.create');
    expect(productionImports).toEqual([]);
  });

  it('backend and web collectedAmount production references exactly match the P03 manifest', () => {
    const backend = collectedAmountFiles(path.join(apiRoot, 'src'))
      .map((file) => `apps/api/${relative(apiRoot, file)}`);
    const web = collectedAmountFiles(path.join(webRoot, 'src'))
      .map((file) => `apps/web/${relative(webRoot, file)}`);
    const actual = [...backend, ...web].sort();
    const manifested = ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1
      .map((entry) => entry.path)
      .sort();

    expect(actual).toEqual(manifested);
    expect(new Set(manifested).size).toBe(manifested.length);
    expect(
      ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1
        .filter((entry) => entry.surface === 'WEB')
        .every((entry) => (entry.classification as string) !== 'RECONCILED_CACHE'),
    ).toBe(true);
    expect(
      ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1
        .some((entry) => (entry.classification as string) === 'LEGAL_AUTHORITY'),
    ).toBe(false);
  });
});

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function collectedAmountFiles(root: string): string[] {
  return sourceFiles(root)
    .filter((file) => fs.readFileSync(file, 'utf8').includes('collectedAmount'))
    .sort();
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      files.push(...sourceFiles(fullPath));
      continue;
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.yaml')) &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replaceAll('\\', '/');
}
