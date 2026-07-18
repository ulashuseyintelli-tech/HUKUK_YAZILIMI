import * as fs from 'node:fs';
import * as path from 'node:path';

const projectRoot = path.resolve(process.cwd(), '..', '..');
const apiRoot = path.join(projectRoot, 'apps', 'api');
const launchPath =
  'src/scripts/rcv-ws04-p03-allocation-replay-launch.ts';

describe('RCV-P2-WS04-P03-A launch-package static boundaries', () => {
  it('has no production call-site or Nest/runtime registration', () => {
    const imports = sourceFiles(path.join(apiRoot, 'src'))
      .filter((file) => relative(apiRoot, file) !== launchPath)
      .filter((file) =>
        /from\s+['"][^'"]*rcv-ws04-p03-allocation-replay-launch['"]/
          .test(fs.readFileSync(file, 'utf8')))
      .map((file) => relative(apiRoot, file));

    expect(imports).toEqual([]);
  });

  it('contains no source mutation, DDL, network client, telemetry or schema surface', () => {
    const source = read(launchPath);

    expect(source).not.toMatch(/\b(fetch|axios|http|https|net|telemetry)\b/);
    expect(source).not.toContain('PrismaClient');
    expect(source).not.toContain('schema.prisma');
    expect(source).not.toContain('TBK100AllocatorService');
    expect(source).not.toMatch(
      /['"`]\s*(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|COPY)\b/i,
    );
    expect(source).not.toContain('CollectionAllocation.create');
    expect(source).not.toContain('LedgerAllocation.create');
  });

  it('keeps the committed launch template disabled and authorization-free', () => {
    const template = JSON.parse(read(
      'evidence-templates/rcv-ws04-p03-a-launch-package.template.json',
    )) as Record<string, unknown>;

    expect(template).toMatchObject({
      enabled: false,
      mode: 'DISABLED',
      productionObservation: 'NOT_AUTHORIZED',
      datasetManifest: { manifestStatus: 'TEST_FIXTURE' },
      accessRecord: { authorizationStatus: 'NOT_AUTHORIZED' },
      executionRecord: { authorizationStatus: 'NOT_AUTHORIZED' },
      environmentSession: { approvalStatus: 'DRAFT' },
    });
  });
});

function read(relativePath: string): string {
  return fs.readFileSync(path.join(apiRoot, relativePath), 'utf8');
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
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replaceAll('\\', '/');
}
